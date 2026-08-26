#!/usr/bin/env python3
"""Écrit le bloc de sources de data/samples.json et reclasse les populations
fondatrices coloniales en `diaspora`.

Deux corrections distinctes :

1. `sources` — bloc de provenance lu par l'app (attribution Leaflet, panneau
   « Sources des données », colonne Source du tableau). L'ancien champ `source`
   (simple chaîne) n'était lu par aucun JS ; il est remplacé par une liste
   structurée, tout en restant rétro-compatible côté lecture.

2. `role` — une population fondatrice coloniale rattachée à son pays de
   résidence fausse la carte : `Afrikaner` étant le seul échantillon lié à ZAF,
   l'Afrique du Sud s'allume pour tout profil ouest-européen alors que le signal
   est généalogique, pas géographique. Les basculer en `diaspora` les masque par
   défaut, la case « Inclure les diasporas » permettant de les réafficher.

Le script est idempotent : le relancer ne change rien de plus.

Usage:
    python3 scripts/set_sources.py [--dry-run]
"""

import argparse
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "data" / "samples.json"

# `url` volontairement absent : ne pas inventer de lien de provenance.
SOURCES = [
    {
        "id": "moriopoulos-2026",
        "title": "Moriopoulos G25 Collection 2026 — All Averages (No Sims)",
        "short": "Moriopoulos G25 2026",
        "notes": (
            "Moyennes de populations, coordonnées Global25 scaled. "
            "Variante sans populations simulées."
        ),
    }
]

# Populations fondatrices coloniales : proches génétiquement de l'Europe de
# l'Ouest par filiation récente, pas par géographie.
AS_DIASPORA = ["Afrikaner"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    data = json.loads(SAMPLES.read_text(encoding="utf-8"))

    before = data.get("sources") or data.get("source")
    data["sources"] = SOURCES
    data.pop("source", None)
    print(f"sources : {before!r}")
    print(f"       -> {SOURCES[0]['title']}")

    moved = []
    by_name = {s["n"]: s for s in data["samples"]}
    for name in AS_DIASPORA:
        s = by_name.get(name)
        if not s:
            print(f"  ATTENTION : '{name}' introuvable, ignoré")
            continue
        if s.get("role") != "diaspora":
            moved.append((name, s.get("role")))
            s["role"] = "diaspora"

    print()
    if moved:
        for name, old in moved:
            print(f"role    : {name} : {old} -> diaspora")
    else:
        print("role    : rien a changer (deja applique)")

    if not args.dry_run:
        SAMPLES.write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"\n-> {SAMPLES.name} reecrit")


if __name__ == "__main__":
    main()
