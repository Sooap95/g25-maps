#!/usr/bin/env python3
"""Reconstruit data/maps/world.geojson depuis Natural Earth 50m.

Le fond 110m d'origine supprime les micro-États : Malte, Luxembourg, Monaco,
Saint-Marin, Andorre, Liechtenstein en étaient absents. Malte existait pourtant
dans samples.json — le pays était donc simplement incolorable.

Le 50m les rétablit. Pour éviter que le fichier n'explose, les coordonnées sont
arrondies avec une **précision adaptative** : un pays large tolère un arrondi
grossier, un micro-État a besoin de décimales sous peine de se réduire à un
point et de disparaître à l'affichage.

Le champ retenu pour `iso3` est ADM0_A3, seul à reproduire les 177 codes du fond
précédent (SAH, PSX, SDS, SOL, KOS…) dont dépend le tagging de samples.json.

Usage:
    python3 scripts/build_world_50m.py [--src ne50m.geojson] [--dry-run]
"""

import argparse
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "maps" / "world.geojson"
NE_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    "master/geojson/ne_50m_admin_0_countries.geojson"
)


def bbox_of(geom):
    xs, ys = [], []

    def walk(c):
        if c and isinstance(c[0], (int, float)):
            xs.append(c[0])
            ys.append(c[1])
        else:
            for sub in c:
                walk(sub)

    walk(geom["coordinates"])
    if not xs:
        return 0.0
    return max(max(xs) - min(xs), max(ys) - min(ys))


def digits_for(span):
    """Plus le territoire est petit, plus on garde de décimales."""
    if span >= 5.0:
        return 2  # ~1.1 km, largement assez pour un pays vu à l'échelle du monde
    if span >= 1.0:
        return 3  # ~110 m
    return 4  # ~11 m, pour Monaco, Saint-Marin, Vatican…


def eps_for(span):
    """Tolérance Douglas-Peucker, en degrés, proportionnée au territoire."""
    if span >= 5.0:
        return 0.05
    if span >= 1.0:
        return 0.012
    return 0.0015


def _dp(pts, eps):
    """Douglas-Peucker itératif (pas de récursion : certains anneaux sont longs)."""
    n = len(pts)
    if n < 3:
        return pts
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        ax, ay = pts[i]
        bx, by = pts[j]
        dx, dy = bx - ax, by - ay
        norm = dx * dx + dy * dy
        best, bi = -1.0, -1
        for k in range(i + 1, j):
            px, py = pts[k]
            if norm == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                # distance au segment, au carré (évite une racine par point)
                t = ((px - ax) * dx + (py - ay) * dy) / norm
                t = 0.0 if t < 0 else (1.0 if t > 1 else t)
                qx, qy = ax + t * dx, ay + t * dy
                d = (px - qx) ** 2 + (py - qy) ** 2
            if d > best:
                best, bi = d, k
        if best > eps * eps:
            keep[bi] = True
            stack.append((i, bi))
            stack.append((bi, j))
    return [p for p, k in zip(pts, keep) if k]


def simplify_ring(ring, eps):
    """DP sur un anneau fermé, en préservant la fermeture."""
    closed = len(ring) >= 2 and ring[0] == ring[-1]
    pts = ring[:-1] if closed else ring[:]
    if len(pts) <= 4:
        return ring
    out = _dp(pts, eps)
    if len(out) < 3:
        return None
    if closed:
        out = out + [out[0]]
    return out


def clean_ring(ring, nd):
    """Arrondit, supprime les points consécutifs identiques, referme l'anneau."""
    out = []
    for x, y in ring:
        p = (round(x, nd), round(y, nd))
        if not out or p != out[-1]:
            out.append(p)
    if len(out) >= 2 and out[0] != out[-1]:
        out.append(out[0])
    return out


def _do_rings(rings, nd, eps):
    out = []
    for r in rings:
        s = simplify_ring([tuple(p[:2]) for p in r], eps)
        if not s:
            continue
        c = clean_ring(s, nd)
        if len(c) >= 4:
            out.append([list(p) for p in c])
    return out


def simplify(geom, nd, eps):
    t = geom["type"]
    if t == "Polygon":
        rings = _do_rings(geom["coordinates"], nd, eps)
        return {"type": "Polygon", "coordinates": rings} if rings else None
    if t == "MultiPolygon":
        polys = [r for poly in geom["coordinates"] if (r := _do_rings(poly, nd, eps))]
        return {"type": "MultiPolygon", "coordinates": polys} if polys else None
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(ROOT.parent / "ne50m.geojson"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    src = pathlib.Path(args.src)
    if not src.exists():
        print(f"telechargement Natural Earth 50m -> {src}")
        urllib.request.urlretrieve(NE_URL, src)

    ne = json.loads(src.read_text(encoding="utf-8"))
    before = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"features": []}
    old_codes = {f["properties"]["iso3"] for f in before["features"]}

    feats, seen = [], set()
    for f in ne["features"]:
        p = f["properties"]
        iso = p.get("ADM0_A3")
        name = p.get("NAME") or p.get("NAME_LONG")
        if not iso or not name or iso in seen:
            continue
        span = bbox_of(f["geometry"])
        geom = simplify(f["geometry"], digits_for(span), eps_for(span))
        if geom is None:
            print(f"  ignore (geometrie vide apres arrondi) : {name}")
            continue
        seen.add(iso)
        feats.append(
            {
                "type": "Feature",
                "properties": {"id": iso, "name": name, "kind": "country", "iso3": iso},
                "geometry": geom,
            }
        )

    feats.sort(key=lambda f: f["properties"]["name"])
    out = {"type": "FeatureCollection", "features": feats}
    blob = json.dumps(out, ensure_ascii=False, separators=(",", ":"))

    new_codes = {f["properties"]["iso3"] for f in feats}
    print(f"\nfeatures : {len(before['features'])} -> {len(feats)}")
    print(f"taille   : {OUT.stat().st_size / 1024:.0f} Ko -> {len(blob.encode()) / 1024:.0f} Ko")
    perdus = sorted(old_codes - new_codes)
    print(f"codes perdus : {perdus or 'aucun'}")
    gagnes = sorted(new_codes - old_codes)
    print(f"codes ajoutes ({len(gagnes)}) : {', '.join(gagnes)}")

    if perdus:
        raise SystemExit("ABANDON : des pays du fond precedent disparaitraient.")

    if not args.dry_run:
        OUT.write_text(blob, encoding="utf-8")
        print(f"\n-> {OUT.name} reecrit")


if __name__ == "__main__":
    main()
