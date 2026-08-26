#!/usr/bin/env python3
"""Construit les jeux de données G25 sélectionnables dans l'app.

Chaque jeu est telechargé depuis exploreyourdna.com, dont les pages de liste
embarquent les coordonnées directement dans le HTML (aucun fichier brut n'est
exposé), puis étiqueté en iso3 / région FR / département FR pour
que la carte puisse le colorer.

Sortie :
    data/datasets/index.json   inventaire lu au démarrage
    data/datasets/<id>.json    un fichier par jeu, chargé à la demande
    data/samples.json          copie du jeu par défaut (compat + démarrage)

Les jeux volumineux (5000 échantillons ≈ 1,4 Mo) ne sont jamais tous chargés :
l'app ne récupère que celui qui est sélectionné.

Usage:
    python3 scripts/build_datasets.py [--only ID] [--offline]
"""

import argparse
import json
import pathlib
import re
import sys
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import demonyms  # noqa: E402
import resolver  # noqa: E402
import tag_iso3  # noqa: E402  (utilisé comme table d'ethnonymes curée)

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "datasets"
SAMPLES = ROOT / "data" / "samples.json"
CATALOG = ROOT / "data" / "maps" / "catalog.json"
CACHE = ROOT / "data" / "geo" / "lists"  # ignoré par git
BASE = "https://www.exploreyourdna.com"

# Échelle de couleur par carte. Le rang n'a d'intérêt que là où la distribution
# est bimodale : sur le Monde, l'écart Europe↔Afrique écrase sinon toute nuance.
SCALES = {"world": "rank"}
SCALE_DEFAULT = "auto"

DATASETS = [
    {
        "id": "moderns-2026",
        "list": (224, "moriopoulos-g25-collection-2026-moderns-only-no-sims"),
        "title": "Moriopoulos G25 Collection 2026 — Moderns Only (No Sims)",
        "short": "Moriopoulos 2026 · Modernes",
        "notes": "Moyennes de populations actuelles, coordonnées scaled, sans populations simulées.",
        "kind": "modern",
        "default": True,
    },
    {
        "id": "ancients-2026",
        "list": (226, "moriopoulos-g25-collection-2026-ancients-only-no-sims"),
        "title": "Moriopoulos G25 Collection 2026 — Ancients Only (No Sims)",
        "short": "Moriopoulos 2026 · Anciens",
        "notes": "Moyennes de populations anciennes, du Paléolithique à l'époque moderne. "
                 "Étiquettes de la forme Pays_Période_Culture_Site.",
        "kind": "ancient",
    },
    {
        "id": "iron-age-europe",
        "list": (62, "moyennes-g25-age-de-fer-en-europe"),
        "title": "Moyennes G25 Âge du Fer en Europe",
        "short": "Âge du Fer · Europe",
        "notes": "Moyennes par pays, échantillons de 1000 av. J.-C. à 100 apr. J.-C.",
        "kind": "ancient",
    },
    {
        "id": "iron-age-gauls",
        "list": (153, "iron-age-gauls-france"),
        "title": "Iron Age Gauls (France)",
        "short": "Gaulois · Âge du Fer",
        "notes": "Individus gaulois par région française, avec datation et couverture.",
        "kind": "ancient",
    },
    {
        "id": "celtic-germanic",
        "list": (195, "the-spread-of-celtic-and-germanic-dna-in-europe"),
        "title": "The spread of Celtic and Germanic DNA in Europe",
        "short": "Celtes & Germains",
        "notes": "Âge du Bronze, Âge du Fer et haut Moyen Âge en Europe, "
                 "dont la période des migrations.",
        "kind": "ancient",
    },
]

ROW = re.compile(
    r"(?:^|[\r\n>])([A-Za-z][^,\r\n<>\"]{0,160}?),"
    r"((?:-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?,){24}-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)"
    r"(?=[\r\n<]|$)"
)

# Subdivisions des grands pays plurilingues : sans elles, « Adiyan_Kerala » ou
# « Amhara » restent orphelins alors que leur pays est evident.
SUBNATIONAL = {}
for _iso, _noms in [
    ("IND", "kerala tamil nadu karnataka andhra telangana maharashtra gujarat punjab "
            "haryana rajasthan bihar odisha jharkhand chhattisgarh madhya pradesh uttar "
            "uttarakhand himachal jammu kashmir bengal assam manipur mizoram nagaland "
            "tripura meghalaya arunachal sikkim goa"),
    ("CHN", "yunnan guizhou sichuan gansu qinghai shaanxi shanxi henan hebei shandong "
            "jiangsu zhejiang fujian guangdong guangxi hunan hubei jiangxi anhui liaoning "
            "jilin heilongjiang xinjiang tibet ningxia"),
    ("ETH", "amhara oromo tigray afar sidama gurage wolayta"),
    ("RUS", "dagestan chechnya ingushetia ossetia kabardino karachay adygea tatarstan "
            "bashkortostan chuvashia mordovia udmurtia komi karelia buryatia tuva "
            "khakassia yakutia sakha kalmykia"),
    ("IDN", "java sumatra sulawesi borneo flores bali"),
]:
    for _n in _noms.split():
        SUBNATIONAL[_n] = _iso


def fetch(url):
    return urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=120
    ).read().decode("utf-8", "replace")


def load_list(list_id, slug, offline):
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / f"{list_id}.html"
    if cached.exists():
        html = cached.read_text(encoding="utf-8")
    elif offline:
        raise SystemExit(f"--offline mais {cached} absent")
    else:
        html = fetch(f"{BASE}/liste/{list_id}/{slug}")
        cached.write_text(html, encoding="utf-8")

    rows, seen = [], set()
    for m in ROW.finditer(html):
        name = m.group(1).strip()
        try:
            coords = [float(x) for x in m.group(2).split(",")]
        except ValueError:
            continue
        if len(coords) != 25 or name in seen:
            continue
        seen.add(name)
        rows.append((name, [round(c, 6) for c in coords]))
    return rows


class Tagger:
    """Attribue iso3, région et département français à une étiquette G25."""

    def __init__(self):
        self.geo = resolver.Resolver()
        self.demonyms = demonyms.build(self.geo.countries)
        curated = list(tag_iso3.EXACT.items()) + list(tag_iso3.DIASPORA.items())
        self.exact = {resolver.fold(k): v for k, v in curated}
        # Index par jeton : « Cameroon_Aghem » rend « aghem » resoluble, car le
        # meme peuple apparait sous un nom nu dans d'autres collections.
        self.token = {}
        for name, iso in curated:
            for t in resolver.fold(name).split():
                if len(t) > 3:
                    self.token.setdefault(t, iso)
        self.diaspora = {resolver.fold(k) for k in tag_iso3.DIASPORA}

    @staticmethod
    def base(name):
        n = re.sub(r"_\(n=\d+\)$", "", name)
        n = re.sub(r"_\([^)]*\)", "", n)
        return re.sub(r"_o$", "", n)

    def iso3(self, name):
        b = self.base(name)
        f = resolver.fold(b)
        if f in self.exact:
            return self.exact[f]
        hit = next((i for p, i in tag_iso3.PREFIX if b.startswith(p)), None)
        if hit:
            return hit
        hit = self.geo.country(name)
        if hit:
            return hit
        toks = sorted(set(f.split()), key=len, reverse=True)
        for table in (self.demonyms, SUBNATIONAL, self.token):
            for t in toks:
                if t in table:
                    return table[t]
        return None

    def role(self, name, kind):
        f = resolver.fold(self.base(name))
        if f in self.diaspora or re.search(r"\b(jew|roma|gypsy|afrikaner)\b", f):
            return "diaspora"
        return "ancient" if kind == "ancient" else "modern"


def build_one(spec, tagger, offline):
    rows = load_list(*spec["list"], offline=offline)
    if not rows:
        raise SystemExit(f"{spec['id']} : aucun echantillon extrait")

    samples, tagged, with_reg, with_dep = [], 0, 0, 0
    for name, coords in rows:
        iso = tagger.iso3(name)
        rec = {"n": name, "c": coords}
        if iso:
            rec["iso3"] = iso
            tagged += 1
        rec["role"] = tagger.role(name, spec["kind"])
        if iso == "FRA":
            reg, dep = tagger.geo.french(name)
            if reg:
                rec["fr_regions"] = [reg]
                with_reg += 1
            if dep:
                rec["fr_depts"] = [dep]
                with_dep += 1
        samples.append(rec)

    doc = {
        "id": spec["id"],
        "dims": 25,
        "metric": "euclidean",
        "sources": [
            {
                "id": spec["id"],
                "title": spec["title"],
                "short": spec["short"],
                "notes": spec["notes"],
                "url": f"{BASE}/liste/{spec['list'][0]}/{spec['list'][1]}",
            }
        ],
        "samples": samples,
    }
    path = OUT / f"{spec['id']}.json"
    path.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(
        f"{spec['id']:<18} {len(samples):>5} ech | iso3 {100*tagged/len(samples):5.1f}% "
        f"| regFR {with_reg:>3} | deptFR {with_dep:>3} | {path.stat().st_size/1024:>6.0f} Ko"
    )
    return doc, {
        "id": spec["id"],
        "title": spec["title"],
        "short": spec["short"],
        "notes": spec["notes"],
        "kind": spec["kind"],
        "count": len(samples),
        "tagged": tagged,
        "file": f"data/datasets/{spec['id']}.json",
        "default": bool(spec.get("default")),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    tagger = Tagger()

    index, default_doc = [], None
    for spec in DATASETS:
        if args.only and spec["id"] != args.only:
            continue
        try:
            doc, entry = build_one(spec, tagger, args.offline)
        except Exception as e:
            # La source est un site tiers : une indisponibilite ne doit pas
            # casser le deploiement. On repart du fichier deja publie s'il
            # existe, et on n'echoue que si le jeu par defaut manque vraiment.
            path = OUT / f"{spec['id']}.json"
            if not path.exists():
                if spec.get("default"):
                    raise SystemExit(f"{spec['id']} indisponible et absent du depot : {e}")
                print(f"{spec['id']:<18} INDISPONIBLE ({e}) - ignore")
                continue
            print(f"{spec['id']:<18} INDISPONIBLE ({e}) - on garde la version publiee")
            doc = json.loads(path.read_text(encoding="utf-8"))
            entry = {
                "id": spec["id"],
                "title": spec["title"],
                "short": spec["short"],
                "notes": spec["notes"],
                "kind": spec["kind"],
                "count": len(doc["samples"]),
                "tagged": sum(1 for s in doc["samples"] if s.get("iso3")),
                "file": f"data/datasets/{spec['id']}.json",
                "default": bool(spec.get("default")),
            }
        index.append(entry)
        if entry["default"]:
            default_doc = doc

    (OUT / "index.json").write_text(
        json.dumps({"datasets": index}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    if default_doc:
        SAMPLES.write_text(
            json.dumps(default_doc, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"\ndefaut -> data/samples.json ({len(default_doc['samples'])} ech)")

    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    for m in cat["maps"]:
        m["scale"] = SCALES.get(m["id"], SCALE_DEFAULT)
    CATALOG.write_text(json.dumps(cat, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("catalog : scale ecrit")


if __name__ == "__main__":
    main()
