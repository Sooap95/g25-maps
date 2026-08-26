#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(p):
    return json.loads((ROOT / p).read_text(encoding="utf-8"))


def euclid(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def test_samples():
    data = load("data/samples.json")
    samples = data["samples"]
    assert len(samples) >= 900
    names = {s["n"] for s in samples}
    for must in ("French_Paris", "French_Brittany", "French_Occitanie", "Sicilian_West"):
        assert must in names, must
    for s in samples:
        assert len(s["c"]) == 25, s["n"]
        assert all(isinstance(x, (int, float)) for x in s["c"]), s["n"]
    paris = next(s for s in samples if s["n"] == "French_Paris")
    bzh = next(s for s in samples if s["n"] == "French_Brittany")
    jp = next(s for s in samples if s["n"] == "Japanese")
    assert paris.get("iso3") == "FRA"
    assert jp.get("iso3") == "JPN"
    assert euclid(paris["c"], paris["c"]) == 0
    d_bzh = euclid(paris["c"], bzh["c"])
    d_jp = euclid(paris["c"], jp["c"])
    assert d_bzh < 0.05, d_bzh
    assert d_jp > 0.2, d_jp
    assert "11" in paris["fr_regions"]
    assert "53" in bzh["fr_regions"]


def test_maps():
    cat = load("data/maps/catalog.json")
    ids = {m["id"] for m in cat["maps"]}
    assert ids == {"world", "europe", "west-europe", "france", "france-depts"}
    for m in cat["maps"]:
        geo = load(m["file"])
        assert geo["features"], m["id"]
        for f in geo["features"]:
            p = f["properties"]
            assert p.get("id") and p.get("name") and p.get("iso3"), p


def test_france_coverage():
    geo = load("data/maps/france.geojson")
    names = {f["properties"]["name"] for f in geo["features"]}
    assert "Bretagne" in names
    assert "Occitanie" in names
    depts = load("data/maps/france-depts.geojson")
    assert len(depts["features"]) == 96


if __name__ == "__main__":
    test_samples()
    test_maps()
    test_france_coverage()
    print("ok")
