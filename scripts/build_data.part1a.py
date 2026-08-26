#!/usr/bin/env python3
"""Build compact G25 sample JSON + slim GeoJSON map layers."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEO = ROOT / "data" / "geo"
OUT = ROOT / "data"
MAPS = ROOT / "data" / "maps"

DEPT_TO_REGION = {
    "01": "84", "02": "32", "03": "84", "04": "93", "05": "93", "06": "93",
    "07": "84", "08": "44", "09": "76", "10": "44", "11": "76", "12": "76",
    "13": "93", "14": "28", "15": "84", "16": "75", "17": "75", "18": "24",
    "19": "75", "21": "27", "22": "53", "23": "75", "24": "75", "25": "27",
    "26": "84", "27": "28", "28": "24", "29": "53", "2A": "94", "2B": "94",
    "30": "76", "31": "76", "32": "76", "33": "75", "34": "76", "35": "53",
    "36": "24", "37": "24", "38": "84", "39": "27", "40": "75", "41": "24",
    "42": "84", "43": "84", "44": "52", "45": "24", "46": "76", "47": "75",
    "48": "76", "49": "52", "50": "28", "51": "44", "52": "44", "53": "52",
    "54": "44", "55": "44", "56": "53", "57": "44", "58": "27", "59": "32",
    "60": "32", "61": "28", "62": "32", "63": "84", "64": "75", "65": "76",
    "66": "76", "67": "44", "68": "44", "69": "84", "70": "27", "71": "27",
    "72": "52", "73": "84", "74": "84", "75": "11", "76": "28", "77": "11",
    "78": "11", "79": "75", "80": "32", "81": "76", "82": "76", "83": "93",
    "84": "93", "85": "52", "86": "75", "87": "75", "88": "44", "89": "27",
    "90": "27", "91": "11", "92": "11", "93": "11", "94": "11", "95": "11",
}

REGION_DEPTS: dict[str, list[str]] = {}
for d, r in DEPT_TO_REGION.items():
    REGION_DEPTS.setdefault(r, []).append(d)

REGION_DEFAULT = {
    "11": "French_Paris", "24": "French_Paris", "27": "French_Alsace",
    "28": "French_Seine-Maritime", "32": "French_Nord", "44": "French_Alsace",
    "52": "French_Paris", "53": "French_Brittany", "75": "French_South",
    "76": "French_Occitanie", "84": "French_Auvergne", "93": "French_Provence",
    "94": "French_Corsica",
}

FR_DEPTS = {
    "French_Paris": REGION_DEPTS["11"], "French_Nord": ["59"],
    "French_Pas-de-Calais": ["62"], "French_Seine-Maritime": ["76"],
    "French_Brittany": REGION_DEPTS["53"], "French_Alsace": ["67", "68"],
    "French_Auvergne": ["03", "15", "43", "63"],
    "French_Occitanie": REGION_DEPTS["76"], "French_Provence": REGION_DEPTS["93"],
    "French_Corsica": ["2A", "2B"], "French_Bearn": ["64"],
    "French_Bigorre": ["65"], "French_Chalosse": ["40"], "French_South": [],
    "Basque_French": ["64"], "Basque_Lower_Navarre": ["64"], "Basque_Soule": ["64"],
}

FR_REGIONS = {
    "French_Paris": ["11"], "French_Nord": ["32"], "French_Pas-de-Calais": ["32"],
    "French_Seine-Maritime": ["28"], "French_Brittany": ["53"], "French_Alsace": ["44"],
    "French_Auvergne": ["84"], "French_Occitanie": ["76"], "French_Provence": ["93"],
    "French_Corsica": ["94"], "French_Bearn": ["75"], "French_Bigorre": ["76"],
    "French_Chalosse": ["75"], "French_South": ["75", "76", "93"],
    "Basque_French": ["75"], "Basque_Lower_Navarre": ["75"], "Basque_Soule": ["75"],
}

