#!/usr/bin/env python3
"""Ajoute aux jeux de données les métadonnées lisibles hors ligne.

Deux sources, aucune requête réseau :

1. L'étiquette elle-même (voir periods.py) — année, période, effectif de la
   moyenne, couverture ADN, marqueurs « low_res » et « outlier ».
2. Les fonds de carte déjà présents dans le dépôt — un point (lat, lon) par
   échantillon, pris au centre du territoire auquel il est rattaché.

Ce point n'est pas un lieu de fouille : c'est le centre du département, de la
région, de la subdivision NUTS ou du pays porté par l'échantillon, le plus
précis disponible. Il suffit à interpoler une surface continue, il ne suffit
pas à situer un site. Le champ `geo` dit lequel des quatre niveaux a servi.

Usage :
    python3 scripts/enrich_datasets.py
"""

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import periods  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
MAPS = DATA / "maps"

# Periode par defaut d'un jeu dont les etiquettes ne datent rien : « Austria »
# ne dit pas l'age du fer, mais le jeu qui la contient, si.
DATASET_PERIOD = {
    "iron-age-europe": (-1000, 100, "iron"),
    "iron-age-gauls": (-800, -50, "iron"),
}


def ring_centroid(ring):
    """Centre de gravite d'un anneau, par la formule du lacet.

    Retourne aussi l'aire signee : elle sert a choisir le plus grand polygone
    d'un pays morcele — sans quoi la France serait centree entre l'Hexagone et
    ses territoires d'outre-mer, au milieu de l'Atlantique.
    """
    a = cx = cy = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i][0], ring[i][1]
        x1, y1 = ring[i + 1][0], ring[i + 1][1]
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if a == 0:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return sum(xs) / len(xs), sum(ys) / len(ys), 0.0
    a *= 0.5
    return cx / (6 * a), cy / (6 * a), abs(a)


def feature_centroid(geom):
    polys = []
    if geom["type"] == "Polygon":
        polys = [geom["coordinates"]]
    elif geom["type"] == "MultiPolygon":
        polys = geom["coordinates"]
    best = None
    for poly in polys:
        if not poly or len(poly[0]) < 4:
            continue
        x, y, area = ring_centroid(poly[0])
        if best is None or area > best[2]:
            best = (x, y, area)
    if not best:
        return None
    return round(best[1], 2), round(best[0], 2)  # (lat, lon)


def build_centroids():
    """Tables de centres, du plus precis au plus large."""
    out = {"dept": {}, "region": {}, "nuts": {}, "country": {}}
    for name, key in [
        ("france-depts.geojson", "dept"),
        ("france.geojson", "region"),
        ("west-europe.geojson", "nuts"),
        ("world.geojson", "country"),
    ]:
        geo = json.loads((MAPS / name).read_text(encoding="utf-8"))
        for f in geo["features"]:
            p = f["properties"]
            c = feature_centroid(f["geometry"])
            if not c:
                continue
            if key == "dept" and p.get("insee"):
                out["dept"][p["insee"]] = c
            elif key == "region" and p.get("insee"):
                out["region"][p["insee"]] = c
            elif key == "nuts" and p.get("nuts"):
                out["nuts"][p["nuts"]] = c
            elif key == "country" and p.get("iso3"):
                out["country"].setdefault(p["iso3"], c)
    return out


def locate(sample, cent):
    """(lat, lon, niveau) le plus precis pour un echantillon, ou None."""
    for code in sample.get("fr_depts") or []:
        if code in cent["dept"]:
            return (*cent["dept"][code], "dept")
    for code in sample.get("fr_regions") or []:
        if code in cent["region"]:
            return (*cent["region"][code], "region")
    for code in sample.get("nuts") or []:
        if code in cent["nuts"]:
            return (*cent["nuts"][code], "nuts")
    iso = sample.get("iso3")
    if iso and iso in cent["country"]:
        return (*cent["country"][iso], "country")
    return None


def enrich(doc, kind, dataset_id, cent):
    default = DATASET_PERIOD.get(dataset_id)
    stats = {"dated": 0, "exact": 0, "located": 0, "periods": {}}
    years = []
    for s in doc["samples"]:
        meta = periods.describe(s["n"], kind)
        if "y" not in meta and default:
            meta["y"] = (default[0] + default[1]) // 2
            meta["p"] = default[2]
        if "p" not in meta and default:
            meta["p"] = default[2]
        s.update(meta)
        if "y" in s:
            stats["dated"] += 1
            years.append(s["y"])
        if s.get("ya"):
            stats["exact"] += 1
        if s.get("p"):
            stats["periods"][s["p"]] = stats["periods"].get(s["p"], 0) + 1

        pos = locate(s, cent)
        if pos:
            s["lat"], s["lon"], s["geo"] = pos
            stats["located"] += 1
    if years:
        stats["ymin"], stats["ymax"] = min(years), max(years)
    return stats


def main():
    index_path = DATA / "datasets" / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    cent = build_centroids()
    print(
        f"centres : {len(cent['dept'])} depts, {len(cent['region'])} regions, "
        f"{len(cent['nuts'])} NUTS, {len(cent['country'])} pays\n"
    )

    for entry in index["datasets"]:
        path = ROOT / entry["file"]
        doc = json.loads(path.read_text(encoding="utf-8"))
        stats = enrich(doc, entry["kind"], entry["id"], cent)
        path.write_text(
            json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        n = len(doc["samples"])
        entry["dated"] = stats["dated"]
        entry["located"] = stats["located"]
        if "ymin" in stats:
            entry["ymin"], entry["ymax"] = stats["ymin"], stats["ymax"]
        entry["periods"] = [c for c, _ in periods.PERIOD_LABELS if c in stats["periods"]]
        print(
            f"{entry['id']:<18} {n:>5} ech | dates {100*stats['dated']//n:>3} % "
            f"({stats['exact']} exactes) | situes {100*stats['located']//n:>3} % "
            f"| {path.stat().st_size/1024:>6.0f} Ko"
        )

    index_path.write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    # samples.json est la copie du jeu par defaut chargee au demarrage.
    default = next((d for d in index["datasets"] if d.get("default")), None)
    if default:
        src = ROOT / default["file"]
        (DATA / "samples.json").write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        print("\ndata/samples.json aligne sur", default["id"])


if __name__ == "__main__":
    main()
