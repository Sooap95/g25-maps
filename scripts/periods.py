#!/usr/bin/env python3
"""Datation d'un échantillon G25 à partir de son étiquette.

Les collections Global25 n'exposent aucune métadonnée : tout est dans le nom.
« Croatia_MBA_Posusje_(n=1) » dit l'Âge du Bronze moyen, « Chile_Caleta_Huelen_
MH_1100BP » donne une date absolue, « FRA_GrandEst_IA:COL11__BC_340__Cov_12.30% »
donne l'année et la couverture. Ce module lit ces trois dialectes.

Deux règles rendent la lecture fiable là où une simple recherche de mots-clés
se trompe :

1. Les étiquettes sont d'abord débarrassées de leurs parenthèses. Sans quoi le
   « n » de « (n=1) » se lit « N » pour Néolithique et ramène la moitié de la
   collection au 5e millénaire.
2. Chaque motif appartient à une famille et y est soit précis, soit générique.
   Quand « Roman_Republic » est reconnu, le « Roman » générique de la même
   famille est écarté — sinon l'intervalle s'étirerait de -509 à 476.

Limite assumée : les abréviations sont calées sur la chronologie européenne.
« LN » vaut ici ~3800-2800 av. J.-C. alors qu'en Chine la même abréviation
désigne ~3000-2000. Une datation déduite d'un mot-clé reste donc indicative,
et toute date numérique portée par l'étiquette l'emporte sur elle.
"""

import re

# (motif, debut, fin, code, famille, generique)
# Annees negatives avant J.-C. Un motif « generique » ne sert que si aucun
# motif precis de sa famille n'a ete reconnu.
PERIODS = [
    (r"Upper Palaeolithic|Upper Paleolithic|\bUP\b", -45000, -12000, "paleo", "paleo", False),
    (r"Epipalaeolithic|Epipaleolithic", -20000, -10000, "paleo", "paleo", False),
    (r"Palaeolithic|Paleolithic", -45000, -12000, "paleo", "paleo", True),
    (r"Mesolithic|\bMeso\b", -10000, -5500, "meso", "meso", True),
    (r"Early Neolithic|\bEN\b|\bEN1\b|\bEN2\b", -6500, -4500, "neo", "neo", False),
    (r"Middle Neolithic|\bMN\b|\bMN1\b|\bMN2\b", -4900, -3800, "neo", "neo", False),
    (r"Late Neolithic|\bLN\b|\bLN1\b|\bLN2\b", -3800, -2800, "neo", "neo", False),
    (r"Neolithic", -6500, -2500, "neo", "neo", True),
    (r"Chalcolithic|Eneolithic|Copper Age", -3500, -2200, "chalco", "chalco", True),
    (r"Early Bronze Age|\bEBA\b", -3300, -2000, "bronze", "bronze", False),
    (r"\bEMBA\b", -3300, -1550, "bronze", "bronze", False),
    (r"\bMLBA\b", -2000, -1200, "bronze", "bronze", False),
    (r"Middle Bronze Age|\bMBA\b", -2000, -1550, "bronze", "bronze", False),
    (r"Late Bronze Age|\bLBA\b", -1550, -1200, "bronze", "bronze", False),
    (r"Bronze Age|\bBA\b", -3300, -800, "bronze", "bronze", True),
    (r"Early Iron Age|\bEIA\b", -1200, -600, "iron", "iron", False),
    (r"Middle Iron Age|\bMIA\b", -600, -300, "iron", "iron", False),
    (r"Late Iron Age|\bLIA\b", -300, 0, "iron", "iron", False),
    (r"Iron Age|\bIA\b|\bIA\d\b|\bIAI+\b", -1200, 0, "iron", "iron", True),
    (r"Hallstatt", -800, -450, "iron", "iron", False),
    (r"La Tene|La Tène", -450, -50, "iron", "iron", False),
    (r"Archaic", -800, -480, "antiq", "greek", False),
    (r"Classical", -480, -323, "antiq", "greek", False),
    (r"Hellenistic", -323, -31, "antiq", "greek", False),
    (r"Roman Republic", -509, -27, "antiq", "rome", False),
    (r"Roman Empire|Imperial Rome", -27, 476, "antiq", "rome", False),
    (r"\bRoman\b", -27, 476, "antiq", "rome", True),
    (r"Late Antiquity", 284, 640, "antiq", "lateantiq", False),
    (r"Antiquity", -800, 476, "antiq", "lateantiq", True),
    (r"Migration Period|\bMigration\b", 375, 568, "migr", "migration", False),
    (r"Anglo-Saxon", 410, 1066, "migr", "anglosaxon", False),
    (r"Merovingian", 481, 751, "migr", "migration", False),
    (r"Viking Age|\bViking\b", 793, 1066, "medieval", "viking", False),
    (r"Carolingian", 751, 987, "medieval", "medieval", False),
    (r"Early Medieval", 500, 1000, "medieval", "medieval", False),
    (r"High Medieval", 1000, 1300, "medieval", "medieval", False),
    (r"Late Medieval", 1300, 1500, "medieval", "medieval", False),
    (r"Medieval", 500, 1500, "medieval", "medieval", True),
    # Cultures et dynasties nommees sans mention de periode : elles datent a
    # elles seules 300 echantillons de plus, dont les Campaniformes et la
    # Ceramique cordee, tres presents dans les jeux europeens.
    (r"Bell Beaker|Beaker", -2800, -1800, "bronze", "culture", False),
    (r"Corded Ware", -2900, -2350, "chalco", "culture", False),
    (r"Yamnaya", -3300, -2600, "chalco", "culture", False),
    (r"Unetice", -2300, -1600, "bronze", "culture", False),
    (r"Cucuteni|Trypillia", -4800, -3000, "neo", "culture", False),
    (r"Scythian", -900, -200, "iron", "culture", False),
    (r"Sarmatian", -400, 400, "iron", "culture", False),
    (r"\bHun\b|Hunnic", 370, 469, "migr", "culture", False),
    (r"Shang Dynasty|\bShang\b", -1600, -1046, "bronze", "dynastie", False),
    (r"Zhou Dynasty|\bZhou\b", -1046, -256, "iron", "dynastie", False),
    (r"Han Dynasty|\bHan\b", -202, 220, "antiq", "dynastie", False),
    (r"Tang Dynasty|\bTang\b", 618, 907, "medieval", "dynastie", False),
    (r"Song Dynasty|\bSong\b", 960, 1279, "medieval", "dynastie", False),
    (r"Ming Dynasty|\bMing\b", 1368, 1644, "modern", "dynastie", False),
    (r"Qing Dynasty|\bQing\b", 1644, 1912, "modern", "dynastie", False),
    (r"Ottoman", 1299, 1922, "modern", "modern", False),
    (r"Early Modern", 1500, 1800, "modern", "modern", False),
    (r"Late Modern", 1800, 1950, "modern", "modern", False),
    (r"Modern", 1500, 1950, "modern", "modern", True),
]

_COMPILED = [
    (re.compile(p, re.I), a, b, code, fam, gen) for p, a, b, code, fam, gen in PERIODS
]

# Dates absolues portees par l'etiquette. Elles priment sur les mots-cles.
# Le trait bas etant un caractere de mot, « __BC_340__ » et « _1100BP_ »
# n'offrent aucune frontiere \b : on borne donc sur les chiffres eux-memes.
_ABS = [
    (re.compile(r"_BC_(\d{1,5})(?!\d)"), lambda m: -int(m.group(1))),
    (re.compile(r"_AD_(\d{1,4})(?!\d)"), lambda m: int(m.group(1))),
    (re.compile(r"(?<!\d)(\d{3,5})\s?BP(?![A-Za-z0-9])", re.I), lambda m: 1950 - int(m.group(1))),
    (re.compile(r"(?<!\d)(\d{3,5})\s?BCE(?![A-Za-z0-9])", re.I), lambda m: -int(m.group(1))),
    (re.compile(r"(?<!\d)(\d{3,4})\s?CE(?![A-Za-z0-9])"), lambda m: int(m.group(1))),
]

_COV = re.compile(r"Cov[_\s]?([\d.]+)\s?%", re.I)
_N = re.compile(r"\(n=(\d+)\)")
_LOWRES = re.compile(r"low[_\s]?res|noisy|contam", re.I)
_OUTLIER = re.compile(r"_o\d?(?:_|$)")
_PARENS = re.compile(r"\([^()]*\)")


def _spaced(label):
    """Etiquette sans parentheses, ramenee a des mots separes.

    Les parentheses ne portent que des annotations — « (n=3) », « (low_res) »,
    « (East_Med_Profile) » — lues ailleurs, et dont les initiales polluent la
    reconnaissance des periodes.
    """
    text = _PARENS.sub(" ", label)
    return re.sub(r"[_/:().\-]+", " ", text)


def period_of(label):
    """(annee_debut, annee_fin, code) d'apres les mots-cles, ou None.

    Les etiquettes composites — « Late_Antiquity-Early_Medieval », « N-EBA » —
    sont frequentes : on prend l'union des intervalles reconnus plutot que le
    premier, sinon un echantillon a cheval sur deux periodes serait date par
    celle qui ouvre son nom.
    """
    text = _spaced(label)
    by_family = {}
    for rx, a, b, code, fam, generic in _COMPILED:
        if not rx.search(text):
            continue
        by_family.setdefault(fam, {"precis": [], "generique": []})
        by_family[fam]["generique" if generic else "precis"].append((a, b, code))

    hits = []
    for entry in by_family.values():
        hits.extend(entry["precis"] or entry["generique"])
    if not hits:
        return None

    start = min(h[0] for h in hits)
    end = max(h[1] for h in hits)
    # Le code retenu est celui de la periode la plus recente citee : dans
    # « Late_Antiquity-Early_Medieval », l'echantillon est medieval, et c'est
    # ainsi qu'on le rangerait sur une frise.
    code = max(hits, key=lambda h: h[0])[2]
    return start, end, code


def year_of(label):
    """(annee, exacte?) — annee centrale de l'echantillon, negative avant J.-C."""
    for rx, conv in _ABS:
        m = rx.search(label)
        if m:
            return conv(m), True
    per = period_of(label)
    if per:
        return (per[0] + per[1]) // 2, False
    return None, False


def describe(label, kind="ancient"):
    """Metadonnees extractibles d'une etiquette, en champs courts.

    y   annee centrale (negative avant J.-C.)
    ya  vrai si l'annee vient d'une date explicite, absent si deduite
    p   code de periode
    k   effectif de la moyenne (n=)
    cov couverture ADN en %
    lo  vrai si l'etiquette signale un profil bruite (low_res, noisy)
    ol  vrai si l'echantillon est marque comme aberrant (_o, _o1)
    """
    out = {}
    if kind != "modern":
        year, exact = year_of(label)
        if year is not None:
            out["y"] = year
            if exact:
                out["ya"] = 1
        per = period_of(label)
        if per:
            out["p"] = per[2]
    m = _N.search(label)
    if m:
        out["k"] = int(m.group(1))
    m = _COV.search(label)
    if m:
        out["cov"] = round(float(m.group(1)), 2)
    if _LOWRES.search(label):
        out["lo"] = 1
    if _OUTLIER.search(label):
        out["ol"] = 1
    return out


# Libelles affiches par l'interface, dans l'ordre chronologique.
PERIOD_LABELS = [
    ("paleo", "Paléolithique"),
    ("meso", "Mésolithique"),
    ("neo", "Néolithique"),
    ("chalco", "Chalcolithique"),
    ("bronze", "Âge du Bronze"),
    ("iron", "Âge du Fer"),
    ("antiq", "Antiquité"),
    ("migr", "Migrations"),
    ("medieval", "Moyen Âge"),
    ("modern", "Époque moderne"),
]


if __name__ == "__main__":
    cas = [
        ("FRA_GrandEst_IA:COL11__BC_340__Cov_12.30%", -340, "iron"),
        ("Chile_Caleta_Huelen_MH_1100BP_(n=2)", 850, None),
        ("Croatia_MBA_Posusje_(n=1)", -1775, "bronze"),
        ("Hungary_Late_Antiquity-Early_Medieval_Avar_Period_(East_Med_Profile)_(n=5)", 642, "medieval"),
        ("Sweden_Early-High_Medieval_Viking_Age_Skara_(Mixed_Profile)_(n=1)", 1046, "medieval"),
        ("Irkutsk_N-EBA_Mys_Uyuga_(n=1)", -2650, "bronze"),
        ("Netherlands_MIA-LIA_(low_res)_(n=1)", -300, "iron"),
        ("Italy_Lazio_Roman_Republic_Tarquinia_(East_Anatolian_Profile)_(n=1)", -268, "antiq"),
        ("Abkhazia_Late_Modern_Tkhina_(Chari_River_Profile)_(n=1)", 1875, "modern"),
        ("France_IA2_La_Tene_Occitanie_(Northwest_Euro_Profile)_(n=2)", -250, "iron"),
        ("Greece_Roman_Empire_Corinthia_Tenea_(n=1)", 224, "antiq"),
        ("Nepal_IA_Chokhopani_(n=2)", -600, "iron"),
    ]
    bad = 0
    for label, want_y, want_p in cas:
        d = describe(label)
        ok = d.get("y") == want_y and (want_p is None or d.get("p") == want_p)
        bad += not ok
        print(f"{'ok ' if ok else 'ECHEC'} {label[:58]:<60} {d}")
    print("ok" if not bad else f"{bad} cas en echec")
