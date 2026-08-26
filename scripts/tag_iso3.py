#!/usr/bin/env python3
"""Attribue un iso3 (et un role) aux échantillons de data/samples.json qui n'en ont pas.

Sans iso3, samplesForFeature() ne peut jamais rattacher un échantillon à un polygone
pays : la carte Monde reste grise. Ce script comble ce trou.

Les codes cibles sont ceux de Natural Earth tels qu'utilisés par data/maps/world.geojson
(attention : PSX pour la Palestine, SDS pour le Soudan du Sud, SAH pour le Sahara
occidental, SOL pour le Somaliland, KOS pour le Kosovo).

Usage:
    python3 scripts/tag_iso3.py            # écrit data/samples.json
    python3 scripts/tag_iso3.py --dry-run  # affiche seulement le rapport
"""

import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "data" / "samples.json"
WORLD = ROOT / "data" / "maps" / "world.geojson"

# --- Correspondances exactes : nom d'échantillon -> iso3 ----------------------
# Regroupées par région pour rester relisibles.

EXACT = {}


def add(iso3, *names):
    for n in names:
        EXACT[n] = iso3


# Afrique subsaharienne
add("TCD", "Baggara_Arab_Chad_A", "Baggara_Arab_Chad_B", "Bulala", "Chad_Dangaleat",
    "Chad_Daza", "Chad_Daza_o", "Chad_Maba", "Zaghawa_Chad", "Kaba", "Laka")
add("SDN", "Baggara_Arab_Sudan", "Sudan_Arab_Kababish", "Sudan_Arab_Rashaayda",
    "Sudan_Daju", "Sudan_Nuba_Koalib", "Sudanese", "Zaghawa_Sudan")
add("SDS", "Dinka")
add("KEN", "Bantu_Kenya", "Elmolo", "Kikuyu", "Luhya_Kenya", "Luo", "Masai", "Ogiek",
    "Rendille", "Sengwer", "Somali_Kenya")
add("TZA", "Datog", "Hadza", "Iraqw", "Sandawe")
add("ZAF", "Bantu_S.E.", "Khomani_San", "Afrikaner")
add("NAM", "Bantu_S.W.", "Ju_hoan_North")
add("CMR", "Bedzan", "Baka", "Bakola", "Cameroon_Aghem", "Cameroon_Bafut",
    "Cameroon_Bakoko", "Cameroon_Bangwa", "Cameroon_Mbo", "Lemande", "Mada",
    "Ngumba", "Tikar_South", "Kom")
add("CAF", "Biaka")
add("COD", "Mbuti", "Kongo")
add("MOZ", "Chopi", "Makhuwa", "Mwani", "Ronga", "Sena", "Tswa", "Bitonga", "Changana")
add("ZWE", "Ndau", "Manyika")
add("MWI", "Nyanja")
add("AGO", "Ganguela", "Nyaneka", "Umbundu")
add("MDG", "Madagascar_Mikea", "Madagascar_Temoro", "Madagascar_Vezo")
add("NGA", "Esan_Nigeria", "Igbo", "Yoruba", "Fulani")
add("SEN", "Mandenka", "Senegal_Bedik", "Senegal_Bedik_o", "Senegal_Halpularen")
add("GMB", "Gambian")
add("SLE", "Mende_Sierra_Leone")
add("GIN", "Fulani_Guinea")
add("BFA", "Fulani_Burkina_Faso_Ziniare")
add("ERI", "Eritrean", "Saho_Eritrean")
add("SOM", "Somali")

# Afrique du Nord
add("DZA", "Mozabite", "Berber_Algeria")
add("MAR", "Berber_MAR_ERR", "Berber_MAR_TIZ")
add("TUN", "Berber_Tunisia_Chen", "Berber_Tunisia_Sen", "Tunisia")
add("LBY", "Libyan")
add("EGY", "EgyptianA", "EgyptianB")
add("SAH", "Saharawi")

# Proche / Moyen-Orient
add("SYR", "Alawite", "Kurd_Syria")
add("IRQ", "Assyrian", "Assyrian_o", "Chaldean_Iraq", "Ezid", "Kurd_Iraq",
    "Mandaean_Iraq")
add("TUR", "Assyrian_Mardin", "Kurd_Kurmanji_Turkey", "Kurd_Kurmanji_Turkey_o",
    "Kurd_Zaza_Turkey", "Rumelia_East")
add("IRN", "Kurd_Sorani_Iran_Mukriyan", "Balochi_Iran", "Balochi_Iran_o",
    "Turkmen_Iran")
add("ARM", "Kurd_USSR")
add("ISR", "BedouinA", "BedouinB", "Druze")
add("PSX", "Palestinian", "Palestinian_Beit_Sahour", "Samaritan")
add("JOR", "Jordanian")
add("ARE", "EmiratiA", "EmiratiB", "EmiratiC")
add("SAU", "SaudiA", "SaudiB")

# Caucase et Russie européenne
add("GEO", "Abkhasian", "Abkhasian_Gudauta", "Ossetian")
add("AZE", "Tat_Azerbaijan", "Udi", "Talysh_Azerbaijan")
add("RUS", "Abazin", "Adygei", "Akhvakh", "Andian_A", "Andian_B", "Avar", "Avar_o",
    "Bagvalin", "Bagvalin_o", "Balkar", "Chamalin", "Chechen", "Cherkes",
    "Circassian", "Darginian", "Hinukh", "Hunzib", "Ingushian", "Kabardin",
    "Kaitag", "Karachay", "Karata", "Kubachinian", "Kumyk", "Lak", "Lezgin",
    "Mogush", "North_Ossetian", "Ratlub", "Tabasaran", "Tat_Dagestan_Dzhalgan",
    "Tat_Dagestan_Nyugdi", "Tsez_A", "Tsez_B", "Nogai")

# Sibérie, Oural, Volga
add("RUS", "Altaian", "Altaian_Kizhi", "Altaian_Kizhi_o", "Bashkir", "Besermyan",
    "Buryat", "Buryat_o", "Chukchi", "Chuvash", "Dolgan", "Erzya", "Even", "Evenk",
    "Evenk_o", "Itelmen", "Karelian", "Ket", "Ket_o1", "Ket_o2", "Khakass",
    "Khakass_Kachins", "Khamnegan", "Khanty", "Khanty_o1", "Khanty_o2", "Kalmyk",
    "Komi_A", "Komi_B", "Koryak", "Mansi", "Mari", "Moksha", "Mordovian", "Nanai",
    "Negidal", "Nenets", "Nenets_Forest", "Nenets_Tundra", "Nganasan", "Nganasan_o",
    "Nivkh", "Selkup", "Shor", "Shor_Khakassia", "Shor_Mountain", "Tatar_Kazan",
    "Tatar_Mishar", "Tatar_Siberian", "Tatar_Siberian_Zabolotniye", "Teleut",
    "Teleut_o", "Todzin", "Tubalar", "Tuvinian", "Udmurt", "Ulchi", "Vepsian",
    "Yakut_Sakha", "Yukagir", "Yukagir_Forest", "Yukagir_Tundra", "Ingrian",
    "Saami_Kola", "Cossack_Kuban", "Eskimo", "Eskimo_Chaplin", "Eskimo_Naukan",
    "Eskimo_Sireniki")
add("UKR", "Cossack_Ukrainian", "Tatar_Crimean_steppe")
add("BLR", "Tatar_Lipka")
add("FIN", "Saami")

# Europe divers
add("MDA", "Gagauz", "Moldovan_o")
add("ROU", "Nogai_Dobruja")
add("DEU", "Sorb_Niederlausitz")
add("GRC", "Pomak_Almopia_Plain", "Patriyot_West_Macedonia")
add("BGR", "Pomak_Danubian_Plain", "Pomak_Rhodope_Mountains")
add("MKD", "Pomak_Tikves_Plain", "Torbeši_Polog")
add("GRL", "Greenlander_East", "Greenlander_West")

# Asie centrale et Afghanistan / Pakistan
add("UZB", "Karakalpak", "Turkmen_Uzbekistan", "Uzbek")
add("KGZ", "Kirghiz", "Dungan")
add("CHN", "Kirghiz_China", "Uygur", "Pamiri_Sarikoli")
add("TJK", "Kirghiz_Tajikistan_Pamir", "Tajik_Tajikistan_Ayni", "Tajik_Tajikistan_Hisor",
    "Tajik_Tajikistan_Kulob", "Tajik_Yaghnobi", "Pamiri_Badakhshan",
    "Pamiri_Ishkashim", "Pamiri_Rushan", "Pamiri_Shugnan", "Pamiri_Wakhi")
add("TKM", "Turkmen", "Turkmen_o")
add("AFG", "Tajik_Afghanistan", "Hazara", "Hazara_o", "Pashtun_Afghanistan",
    "Pashtun_Afghanistan_North", "Pashtun_Afghanistan_Northeast",
    "Pashtun_Afghanistan_Paktia", "Pashtun_Northeast_Afghanistan")
add("PAK", "Pashtun_Pakistan", "Pashtun_Pakistan_Bettani",
    "Pashtun_Pakistan_Khattak_Nowshera", "Pashtun_Tarkalani", "Pashtun_Uthmankhel",
    "Pashtun_Yusufzai", "Brahui", "Balochi_Pakistan", "Makrani", "Burusho", "Kalash",
    "Kho", "Kohistani", "Balti", "Balti_o", "Sindhi", "Sindhi_o", "Punjabi_Lahore",
    "Mirpuri_Pakistan", "Kashmiri_Pakistan", "Kashmiri_Pakistan_o", "Rajput_AJK",
    "Rajput_Potohar", "Jat_Punjab_Muslim", "Jat_Pahari", "Gujar_Swat", "Gujar_Swat_o",
    "Arain", "Awan", "Parsi_Pakistan")

# Népal / Himalaya
add("NPL", "Bahun", "Bahun_o", "Damai", "Gurung", "Magar", "Newar", "Rai", "Sherpa",
    "Tamang", "Tharu", "Tharu_o1", "Tharu_o2", "Kusunda", "Nepali_Sherpa_Rolwaling",
    "Nepali_Tamang_Simigaon", "Nepali_Tamang_Tashinam", "Nepali_Indo-Aryan_A",
    "Nepali_Indo-Aryan_B", "Nepali_Indo-Aryan_C", "Nepali_Indo-Aryan_D",
    "Nepali_Indo-Aryan_o1", "Nepali_Indo-Aryan_o2")

# Sri Lanka
add("LKA", "Sinhala", "Sri_Lankan", "Tamil_Sri_Lanka")

# Inde
add("IND",
    "Asur", "Balija", "Bhumihar_Bihar", "Bhumij", "Bhunjia_Chhattisgarh", "Birhor",
    "Bonda", "Bunt_Tulu", "Chamar_Uttar_Pradesh", "Chamar_Uttar_Pradesh_o", "Chenchu",
    "Dharkar", "Dhurwa_Odisha", "Dusadh", "Ezhava", "Gadaba", "Garo", "Gond",
    "Gujar_Kashmir", "Gujar_Madhya_Pradesh", "Gujar_Punjab", "Gujar_Rajasthan",
    "Gujarati", "Gujarati_Bharuch_Muslim", "Hakkipikki", "Hmar", "Ho", "Irula",
    "Jamatia", "Jarawa", "Onge", "Jat_Haryana", "Jat_Punjab_Sikh",
    "Jat_Uttar_Pradesh", "Juang", "Kadar", "Kamboj", "Kamboj_o", "Kamma", "Kanjar",
    "Kashmiri_India_Muslim", "Kashmiri_Muslim", "Kashmiri_Pandit", "Kayastha_Bihar",
    "Khandayat_Odisha", "Khatri", "Khatri_o", "Khonda_Dora", "Knanaya", "Kol",
    "Koli_Gujarat", "Konkani_Catholic", "Konkani_Christian_A", "Konkani_Christian_B",
    "Korwa", "Kshatriya_Uttar_Pradesh_East", "Kshatriya_Uttar_Pradesh_East_o", "Kuki",
    "Kurichiya", "Kurumba", "Lubana", "Madiga", "Mala", "Malayan", "Maniyani",
    "Mappila_Muslim", "Maratha", "Mawasi_Chhattisgarh", "Mizo", "Nadar", "Naga",
    "Nair", "Nasrani", "Nihali", "North_Kannadi", "Pallan", "Paniya", "Paniya_o",
    "Parsi_India", "Parsi_India_o", "Pathan_Bhopal", "Pillai_Tamil",
    "Piramalai_Kallar", "Poduval_Kerala_North", "Pulaya_Kerala", "Pulliyar",
    "Punjabi_Christian_India", "Punjabi_Hindu_India", "Punjabi_Muslim_India",
    "Punjabi_Sikh_India", "Rajput_Garhwal", "Rajput_Madhya_Pradesh", "Rajput_Mondal",
    "Rajput_Punjab", "Rajput_Rajasthan", "Reddy", "Relli", "Riang", "Ror", "Sakilli",
    "Saliya_Kerala", "Santhal", "Satnami_Chhattisgarh", "Shia_Uttar_Pradesh",
    "Sonar_Marathi", "Syed_Uttar_Pradesh_West", "Tarkhan_Muslim", "Tarkhan_Sikh/Hindu",
    "Telugu", "Thiyya", "Thiyya_Thrissur", "Toda", "Tripuri", "Tyagi",
    "Uttar_Pradesh_Scheduled_Castes", "Vellalar", "Velama", "Vishwakarma_Kerala",
    "Yadav_Telugu", "Nyishi", "Brahmin_Mondal", "Irani_Zoroastrian_India")

# Chine et Asie de l'Est
add("CHN",
    "Bai", "Baiku_Yao_Guizhou", "Baoan", "Blang", "Bonan", "Changshan_Yao_Guizhou",
    "Dai", "Daur", "Dong_Guizhou", "Dong_Hunan", "Dongxiang", "Gelao", "Hani",
    "Hezhen", "Hui", "Hui_Guizhou", "Lahu", "Li", "Manchu", "Manchu_Bijie",
    "Manchu_Jinsha", "Manchu_Jinzhou", "Manchu_Liaoning", "Maonan", "Miao",
    "Miao_Leishan", "Miao_Songtao", "Mongol_Bijie", "Mongol_IMAR",
    "Mongol_Inner_Mongolia", "Mongol_Xinjiang", "Mongola", "Mulam", "Naxi", "Oroqen",
    "Pumi", "Qiang_Danba", "Qiang_Daofu", "QingYao_Guizhou", "Salar", "She", "Tu",
    "Tujia", "Wa", "Xibo", "Yao", "Yi", "Yugur", "Zhuang", "Tai_Lue")
add("CHN", "Tibetan", "Tibetan_Chamdo", "Tibetan_Gangcha", "Tibetan_Gannan",
    "Tibetan_Lhasa", "Tibetan_Nagqu", "Tibetan_Shannan", "Tibetan_Shigatse",
    "Tibetan_Xinlong", "Tibetan_Xunhua", "Tibetan_Yajiang", "Tibetan_Yunnan")
add("MNG", "Mongol", "Mongolian")
add("TWN", "Ami", "Atayal")

# Asie du Sud-Est
add("PHL", "Aeta", "Agta", "Igorot", "Luzon", "Vizayan")
add("THA", "Akha", "Htin_Mal", "Kuy_Suay", "Lawa", "Maniq", "Mlabri", "Nyah_Kur")
add("IDN", "Bajo", "Batak", "Indonesian_Bali", "Indonesian_Java", "Lebbo")
add("MMR", "Burmese", "Karen_Sgaw", "Mon", "Rohingya")
add("KHM", "Cambodian", "Khmer")
add("LAO", "Lao", "Hmong")
add("MYS", "Dusun", "Jehai", "Malay", "Murut", "Tindal")

# Océanie
add("PNG", "Koinanbe", "Kosipe", "Nasoi", "Papuan", "Papuan_Highland_A",
    "Papuan_Highland_B", "Yuku")
add("NZL", "Maori")
add("USA", "Hawaiian", "Amerindian_North", "Tlingit")

# Amériques
add("BOL", "Aymara", "Bolivian_Cochabamba", "Bolivian_LaPaz", "Bolivian_Pando")
add("ARG", "Cachi", "Colla", "Wichi")
add("CAN", "Chipewyan", "Cree")
add("MEX", "Huichol", "Mayan", "Mixe", "Mixtec", "Nahua", "Pima", "Zapotec")
add("BRA", "Karitiana", "Surui")
add("COL", "Piapoco")
add("PER", "Quechua")
add("VEN", "Yukpa")

# --- Règles de préfixe, appliquées après EXACT -------------------------------
# Les castes indiennes se déclinent en dizaines de sous-groupes régionaux
# (Brahmin_*, Baniya_*, …) : un préfixe évite de les énumérer un par un.
PREFIX = [
    ("Brahmin_", "IND"),
    ("Baniya_", "IND"),
    ("Alevi_", "TUR"),
]

EXACT.setdefault("Arora", "IND")


# --- Diasporas : iso3 du pays d'implantation + role="diaspora" ---------------
DIASPORA = {
    "Belmonte_Jew": "PRT",
    "Bukharian_Jew": "UZB",
    "Cochin_Jew_A": "IND",
    "Cochin_Jew_B": "IND",
    "Karaite_Egypt": "EGY",
    "Karaite_Iraq": "IRQ",
    "Kurdish_Jew": "IRQ",
    "Libyan_Jew": "LBY",
    "Mountain_Jew_Azerbaijan": "AZE",
    "Mountain_Jew_Chechnya": "RUS",
    "Mountain_Jew_Dagestan": "RUS",
    "Mumbai_Jew": "IND",
    "Nash_Didan_Jew_Urmia": "IRN",
    "Romaniote_Jew": "GRC",
    "Roma_Balkans": "SRB",
    "Roma_Barcelona": "ESP",
    "Roma_Bilbao": "ESP",
    "Roma_Granada": "ESP",
    "Roma_Madrid": "ESP",
    "Roma_Porto": "PRT",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    world = json.loads(WORLD.read_text(encoding="utf-8"))
    valid = {f["properties"]["iso3"] for f in world["features"]}

    # Garde-fou : aucun code inventé ne doit passer.
    declared = set(EXACT.values()) | set(DIASPORA.values()) | {i for _, i in PREFIX}
    bad = sorted(declared - valid)
    if bad:
        sys.exit(f"iso3 absents de world.geojson : {bad}")

    data = json.loads(SAMPLES.read_text(encoding="utf-8"))
    tagged = 0
    still = []
    for s in data["samples"]:
        if s.get("iso3"):
            continue
        name = s["n"]
        if name in DIASPORA:
            s["iso3"] = DIASPORA[name]
            s["role"] = "diaspora"
            tagged += 1
        elif name in EXACT:
            s["iso3"] = EXACT[name]
            s.setdefault("role", "ethnic")
            tagged += 1
        else:
            hit = next((iso for pre, iso in PREFIX if name.startswith(pre)), None)
            if hit:
                s["iso3"] = hit
                s.setdefault("role", "ethnic")
                tagged += 1
            else:
                still.append(name)

    covered = {s["iso3"] for s in data["samples"] if s.get("iso3")}
    print(f"échantillons taggés      : {tagged}")
    print(f"restent sans iso3        : {len(still)}")
    print(f"pays colorés sur le Monde: {len(covered & valid)} / {len(valid)}")
    if still:
        print("\nnon résolus :")
        for n in still:
            print("   ", n)

    if not args.dry_run:
        SAMPLES.write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"\n-> {SAMPLES} reecrit")


if __name__ == "__main__":
    main()
