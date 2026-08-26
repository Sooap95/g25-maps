#!/usr/bin/env python3
"""Gentilés -> iso3.

Les noms de populations modernes sont des ethnonymes ou des gentilés
(« Albanian », « Algerian_Arab »), pas des noms de pays : un simple scan des
noms de pays du fond de carte ne les attrape pas. On dérive donc les formes
adjectivales, avec une table pour les irrégulières.
"""

# Irrégulières, ou trop éloignées du nom de pays pour être dérivées.
IRREGULAR = {
    "french": "FRA", "german": "DEU", "dutch": "NLD", "flemish": "BEL",
    "walloon": "BEL", "spanish": "ESP", "portuguese": "PRT", "italian": "ITA",
    "sardinian": "ITA", "sicilian": "ITA", "greek": "GRC", "turkish": "TUR",
    "polish": "POL", "czech": "CZE", "slovak": "SVK", "hungarian": "HUN",
    "swedish": "SWE", "danish": "DNK", "norwegian": "NOR", "finnish": "FIN",
    "icelandic": "ISL", "swiss": "CHE", "british": "GBR", "english": "GBR",
    "scottish": "GBR", "welsh": "GBR", "cornish": "GBR", "manx": "IMN",
    "irish": "IRL", "maltese": "MLT", "cypriot": "CYP", "luxembourgish": "LUX",
    "basque": "ESP", "catalan": "ESP", "galician": "ESP", "andalusian": "ESP",
    "castilian": "ESP", "aragonese": "ESP", "asturian": "ESP",
    "alsatian": "FRA", "breton": "FRA", "corsican": "FRA", "occitan": "FRA",
    "arpitan": "FRA", "gascon": "FRA", "norman": "FRA", "picard": "FRA",
    "russian": "RUS", "ukrainian": "UKR", "belarusian": "BLR",
    "moldovan": "MDA", "romanian": "ROU", "bulgarian": "BGR",
    "serbian": "SRB", "croatian": "HRV", "slovenian": "SVN", "bosnian": "BIH",
    "montenegrin": "MNE", "macedonian": "MKD", "albanian": "ALB",
    "kosovar": "KOS", "estonian": "EST", "latvian": "LVA",
    "lithuanian": "LTU", "austrian": "AUT", "belgian": "BEL",
    "georgian": "GEO", "armenian": "ARM", "azerbaijani": "AZE", "azeri": "AZE",
    "kazakh": "KAZ", "uzbek": "UZB", "turkmen": "TKM", "kyrgyz": "KGZ",
    "kirghiz": "KGZ", "tajik": "TJK", "afghan": "AFG", "pashtun": "AFG",
    "iranian": "IRN", "persian": "IRN", "iraqi": "IRQ", "syrian": "SYR",
    "lebanese": "LBN", "jordanian": "JOR", "israeli": "ISR",
    "palestinian": "PSX", "saudi": "SAU", "yemeni": "YEM", "omani": "OMN",
    "emirati": "ARE", "kuwaiti": "KWT", "qatari": "QAT", "bahraini": "BHR",
    "egyptian": "EGY", "libyan": "LBY", "tunisian": "TUN", "algerian": "DZA",
    "moroccan": "MAR", "sudanese": "SDN", "somali": "SOM", "ethiopian": "ETH",
    "eritrean": "ERI", "kenyan": "KEN", "tanzanian": "TZA", "ugandan": "UGA",
    "rwandan": "RWA", "nigerian": "NGA", "ghanaian": "GHA",
    "senegalese": "SEN", "malian": "MLI", "ivorian": "CIV",
    "cameroonian": "CMR", "congolese": "COD", "angolan": "AGO",
    "mozambican": "MOZ", "zambian": "ZMB", "zimbabwean": "ZWE",
    "namibian": "NAM", "botswanan": "BWA", "malagasy": "MDG",
    "japanese": "JPN", "chinese": "CHN", "korean": "KOR", "mongolian": "MNG",
    "vietnamese": "VNM", "thai": "THA", "lao": "LAO", "cambodian": "KHM",
    "burmese": "MMR", "malay": "MYS", "malaysian": "MYS",
    "indonesian": "IDN", "javanese": "IDN", "filipino": "PHL",
    "singaporean": "SGP", "indian": "IND", "pakistani": "PAK",
    "bangladeshi": "BGD", "nepali": "NPL", "nepalese": "NPL",
    "bhutanese": "BTN", "sinhalese": "LKA", "tibetan": "CHN",
    "australian": "AUS", "maori": "NZL", "papuan": "PNG", "hawaiian": "USA",
    "mexican": "MEX", "brazilian": "BRA", "argentine": "ARG",
    "argentinian": "ARG", "peruvian": "PER", "colombian": "COL",
    "chilean": "CHL", "venezuelan": "VEN", "bolivian": "BOL",
    "ecuadorian": "ECU", "uruguayan": "URY", "paraguayan": "PRY",
    "cuban": "CUB", "jamaican": "JAM", "haitian": "HTI",
    "dominican": "DOM", "barbadian": "BRB", "trinidadian": "TTO",
    "bahamian": "BHS", "guyanese": "GUY", "surinamese": "SUR",
    "canadian": "CAN", "american": "USA",
}


def derive(country_name, iso3):
    """Formes adjectivales plausibles d'un nom de pays."""
    c = country_name.lower()
    out = {c}
    stems = {c}
    for suf in ("a", "e", "y", "ia"):
        if c.endswith(suf) and len(c) > len(suf) + 2:
            stems.add(c[: -len(suf)])
    for s in stems:
        out.update({s + "n", s + "an", s + "ian", s + "ese", s + "i", s + "ish"})
    return {o: iso3 for o in out if len(o) > 3}


def build(countries):
    """countries: {nom_folded: iso3} -> {gentilé: iso3}"""
    table = {}
    for name, iso in countries.items():
        table.update(derive(name, iso))
    # Les irrégulières priment sur les formes dérivées.
    table.update(IRREGULAR)
    return table
