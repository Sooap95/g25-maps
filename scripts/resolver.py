#!/usr/bin/env python3
"""Résolution nom d'échantillon G25 -> iso3 / région FR / département FR."""
import json
import pathlib
import re
import unicodedata

MAPS = str(pathlib.Path(__file__).resolve().parent.parent / "data" / "maps") + "/"


def fold(s):
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("'", " ")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def load_geo():
    w = json.load(open(MAPS + "world.geojson", encoding="utf-8"))
    countries = {fold(f["properties"]["name"]): f["properties"]["iso3"] for f in w["features"]}
    r = json.load(open(MAPS + "france.geojson", encoding="utf-8"))
    regions = {fold(f["properties"]["name"]): f["properties"]["insee"] for f in r["features"]}
    d = json.load(open(MAPS + "france-depts.geojson", encoding="utf-8"))
    depts = {fold(f["properties"]["name"]): f["properties"]["insee"] for f in d["features"]}
    return countries, regions, depts


# Territoires nommés autrement dans les étiquettes G25 que sur le fond de carte,
# ou sous-régions rattachées à leur État.
COUNTRY_ALIAS = {
    "england": "GBR", "scotland": "GBR", "wales": "GBR", "britain": "GBR",
    "great britain": "GBR", "northern ireland": "GBR", "cornwall": "GBR",
    "usa": "USA", "united states": "USA", "america": "USA",
    "xinjiang": "CHN", "tibet": "CHN", "inner mongolia": "CHN", "yunnan": "CHN",
    "guizhou": "CHN", "sichuan": "CHN", "qinghai": "CHN", "gansu": "CHN",
    "hong kong": "CHN", "taiwan": "TWN",
    "irkutsk": "RUS", "stavropol": "RUS", "buryatia": "RUS", "yakutia": "RUS",
    "dagestan": "RUS", "chechnya": "RUS", "tatarstan": "RUS", "adygea": "RUS",
    "krasnodar": "RUS", "zabaykalsky": "RUS", "chukotka": "RUS", "kamchatka": "RUS",
    "altai": "RUS", "tuva": "RUS", "bashkortostan": "RUS", "kalmykia": "RUS",
    "karelia": "RUS", "komi": "RUS", "siberia": "RUS", "russia": "RUS",
    "abkhazia": "GEO", "south ossetia": "GEO",
    "crimea": "UKR", "czechia": "CZE", "czech": "CZE", "czech republic": "CZE",
    "macedonia": "MKD", "north macedonia": "MKD", "bosnia": "BIH",
    "herzegovina": "BIH", "bosnia and herzegovina": "BIH",
    "palestine": "PSX", "west bank": "PSX", "gaza": "PSX",
    "south korea": "KOR", "korea": "KOR", "north korea": "PRK",
    "channel islands": "GBR", "isle of man": "IMN",
    "sardinia": "ITA", "sicily": "ITA", "corsica": "FRA",
    "canary islands": "ESP", "balearic islands": "ESP",
    "greenland": "GRL", "faroe islands": "FRO",
    "kosovo": "KOS", "cyprus": "CYP", "north cyprus": "CYN",
    "swaziland": "SWZ", "eswatini": "SWZ", "ivory coast": "CIV",
    "cote d ivoire": "CIV", "drc": "COD", "congo drc": "COD",
    "democratic republic of the congo": "COD", "car": "CAF",
    "burma": "MMR", "myanmar": "MMR", "east timor": "TLS",
    "uae": "ARE", "emirates": "ARE", "somaliland": "SOL",
    "fra": "FRA", "deu": "DEU", "gbr": "GBR", "esp": "ESP", "ita": "ITA",
    "nld": "NLD", "bel": "BEL", "che": "CHE", "aut": "AUT", "prt": "PRT",
}

# Régions nommées autrement dans les étiquettes.
REGION_ALIAS = {"normandy": "28", "brittany": "53", "burgundy": "27", "corsica": "94"}


class Resolver:
    def __init__(self):
        self.countries, self.regions, self.depts = load_geo()
        self.regions.update(REGION_ALIAS)
        # Recherche du plus long libellé d'abord : « Hautes Pyrenees » avant
        # « Pyrenees », sans quoi un département en masquerait un autre.
        self._c = sorted(
            list(self.countries.items()) + list(COUNTRY_ALIAS.items()),
            key=lambda kv: -len(kv[0]),
        )
        self._r = sorted(self.regions.items(), key=lambda kv: -len(kv[0]))
        self._d = sorted(self.depts.items(), key=lambda kv: -len(kv[0]))

    @staticmethod
    def _has(hay, needle):
        return re.search(r"(?:^| )" + re.escape(needle) + r"(?:$| )", hay) is not None

    def country(self, label):
        h = fold(re.sub(r"_\(n=\d+\)$", "", label))
        for name, iso in self._c:
            if self._has(h, name):
                return iso
        return None

    def french(self, label):
        h = fold(label)
        reg = next((i for n, i in self._r if self._has(h, n)), None)
        dep = next((i for n, i in self._d if self._has(h, n)), None)
        return reg, dep
