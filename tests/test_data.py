#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(p):
    return json.loads((ROOT / p).read_text(encoding="utf-8"))


def euclid(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def find(samples, *needles):
    """Premier échantillon contenant tous les fragments donnés."""
    for s in samples:
        if all(n.lower() in s["n"].lower() for n in needles):
            return s
    raise AssertionError(f"aucun echantillon pour {needles}")


def test_samples():
    data = load("data/samples.json")
    samples = data["samples"]
    assert len(samples) >= 900
    for s in samples:
        assert len(s["c"]) == 25, s["n"]
        assert all(isinstance(x, (int, float)) for x in s["c"]), s["n"]

    paris = find(samples, "French", "Paris")
    bzh = find(samples, "Breton")
    jp = find(samples, "Japanese_(n=")
    assert paris.get("iso3") == "FRA"
    assert jp.get("iso3") == "JPN"
    assert euclid(paris["c"], paris["c"]) == 0

    # Un Parisien doit rester bien plus proche d'un Breton que d'un Japonais :
    # garde-fou contre un jeu de donnees melange ou mal parse.
    assert euclid(paris["c"], bzh["c"]) < 0.05
    assert euclid(paris["c"], jp["c"]) > 0.2

    assert "11" in paris.get("fr_regions", []), paris["n"]
    assert "75" in paris.get("fr_depts", []), paris["n"]


def test_datasets():
    index = load("data/datasets/index.json")["datasets"]
    ids = {d["id"] for d in index}
    assert {"moderns-2026", "ancients-2026"} <= ids, ids
    assert sum(1 for d in index if d.get("default")) == 1

    for d in index:
        doc = load(d["file"])
        assert len(doc["samples"]) == d["count"], d["id"]
        assert doc["sources"] and doc["sources"][0].get("title"), d["id"]
        for s in doc["samples"][:50]:
            assert len(s["c"]) == 25, s["n"]
        # Sans localisation, un jeu ne colore rien : on exige un minimum.
        ratio = d["tagged"] / max(1, d["count"])
        assert ratio > 0.6, f"{d['id']} : seulement {ratio:.0%} localisables"


def test_ancients_have_periods():
    """Le jeu ancien doit bien couvrir les periodes demandees.

    Le vocabulaire est abrege : _IA (age du fer), _EBA/_MBA/_LBA (bronze
    ancien / moyen / recent), et Merovingian en toutes lettres.
    """
    doc = load("data/datasets/ancients-2026.json")
    names = [s["n"].lower() for s in doc["samples"]]
    for period in ("merovingian", "_ia", "_eba", "_lba"):
        assert sum(1 for n in names if period in n) >= 10, period

    # Age du fer francais, avec la region conservee dans l'etiquette.
    assert any(n.startswith("france_ia") for n in names)


def test_maps():
    cat = load("data/maps/catalog.json")
    ids = {m["id"] for m in cat["maps"]}
    assert ids == {"world", "europe", "west-europe", "france", "france-depts"}
    for m in cat["maps"]:
        assert m.get("scale") in {"rank", "auto", "pct"}, m["id"]
        geo = load(m["file"])
        assert geo["features"], m["id"]
        for f in geo["features"]:
            p = f["properties"]
            assert p.get("id") and p.get("name") and p.get("iso3"), p


# Miroir Python de mapIsUsable() dans js/g25.js : ces deux seuils décident
# quels onglets de carte sont proposés pour un jeu donné. S'ils changent d'un
# côté, ils doivent changer de l'autre.
MAP_MIN_SPECIFIC = 5
MAP_MIN_DISTINCT = 3

ISO_FALLBACK = {"CYN": "CYP", "PRK": "KOR", "SOL": "SOM", "KOS": "ALB"}


def _match_specific(p, s):
    if p.get("kind") == "dept" and p.get("insee") in (s.get("fr_depts") or []):
        return True
    if p.get("kind") == "region" and p.get("insee") in (s.get("fr_regions") or []):
        return True
    if p.get("nuts") and p["nuts"] in (s.get("nuts") or []):
        return True
    if p.get("kind") == "country" and s.get("iso3") and s["iso3"] == p.get("iso3"):
        return True
    return False


def map_coverage(geo, samples):
    """Territoires documentes et couleurs distinctes qu'une carte peut produire."""
    pool = [s for s in samples if s.get("role") != "diaspora"]
    specific, packs = 0, set()
    for f in geo["features"]:
        p = f["properties"]
        own = [s["n"] for s in pool if _match_specific(p, s)]
        if not own:
            alias = ISO_FALLBACK.get(p.get("iso3"))
            if alias:
                own = [s["n"] for s in pool if s.get("iso3") == alias]
        if own:
            specific += 1
            packs.add("|".join(own))
    return specific, len(packs)


def usable_maps(doc, cat):
    out = []
    for m in cat["maps"]:
        specific, distinct = map_coverage(load(m["file"]), doc["samples"])
        if specific >= MAP_MIN_SPECIFIC and distinct >= MAP_MIN_DISTINCT:
            out.append(m["id"])
    return out


def test_every_dataset_has_a_usable_map():
    """Un jeu sans carte exploitable n'aurait plus rien a afficher."""
    cat = load("data/maps/catalog.json")
    for d in load("data/datasets/index.json")["datasets"]:
        assert usable_maps(load(d["file"]), cat), d["id"]


def test_gauls_cover_french_regions_only():
    """Les Gaulois documentent des regions, pas des departements ni des pays.

    Avant le filtrage, « France - departements » peignait ses 96 polygones
    d'une seule teinte, empruntee a la moyenne nationale : une carte lisse et
    fausse. Elle ne doit plus etre proposee pour ce jeu.
    """
    cat = load("data/maps/catalog.json")
    ok = usable_maps(load("data/datasets/iron-age-gauls.json"), cat)
    assert "france" in ok
    assert "france-depts" not in ok
    assert "world" not in ok


def test_grand_est_gauls_are_located():
    """34 Gaulois etiquetes « GrandEst » restaient hors carte, mot colle."""
    doc = load("data/datasets/iron-age-gauls.json")
    grand_est = [s for s in doc["samples"] if "GrandEst" in s["n"]]
    assert len(grand_est) >= 30
    assert all("44" in (s.get("fr_regions") or []) for s in grand_est)


def test_world_has_microstates():
    geo = load("data/maps/world.geojson")
    codes = {f["properties"]["iso3"] for f in geo["features"]}
    for iso in ("MLT", "LUX", "MCO", "SMR"):
        assert iso in codes, iso


def test_france_coverage():
    geo = load("data/maps/france.geojson")
    names = {f["properties"]["name"] for f in geo["features"]}
    assert "Bretagne" in names
    assert "Occitanie" in names
    depts = load("data/maps/france-depts.geojson")
    assert len(depts["features"]) == 96


if __name__ == "__main__":
    for fn in list(globals().values()):
        if callable(fn) and getattr(fn, "__name__", "").startswith("test_"):
            fn()
    print("ok")
