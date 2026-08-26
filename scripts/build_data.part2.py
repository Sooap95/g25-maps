def parse_g25(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as fh:
        header = fh.readline()
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split(",")]
            name = parts[0]
            try:
                coords = [float(x) for x in parts[1:26]]
            except ValueError:
                continue
            if len(coords) != 25:
                continue
            rows.append({"n": name, "c": coords})
    return rows


def is_diaspora(name: str) -> bool:
    if name.startswith("Ashkenazi") or name.startswith("Roma_"):
        return True
    if name.endswith("_Jew") or "_Jew_" in name:
        return True
    for t in DIASPORA_TOKENS:
        if t in name:
            return True
    return False


def map_sample(name: str) -> dict:
    if name in EXACT:
        m = dict(EXACT[name])
    else:
        m = {}
        token = name.split("_")[0]
        iso = TOKEN_ISO.get(token)
        if iso:
            m["iso3"] = iso
            m["role"] = "national"
        for prefix, iso3 in (
            ("French", "FRA"), ("Spanish", "ESP"), ("Italian", "ITA"),
            ("German", "DEU"), ("Greek", "GRC"), ("Russian", "RUS"),
            ("Ukrainian", "UKR"), ("Turkish", "TUR"), ("Han", "CHN"),
            ("Georgian", "GEO"), ("Armenian", "ARM"), ("Azerbaijani", "AZE"),
            ("Iranian", "IRN"), ("Lebanese", "LBN"), ("Syrian", "SYR"),
            ("Yemenite", "YEM"), ("Saudi", "SAU"), ("Moroccan", "MAR"),
            ("Tunisian", "TUN"), ("Algerian", "DZA"), ("Egyptian", "EGY"),
            ("Ethiopian", "ETH"), ("Finnish", "FIN"), ("Lithuanian", "LTU"),
            ("Swiss", "CHE"), ("Belgian", "BEL"), ("Polish", "POL"),
        ):
            if name.startswith(prefix + "_") or name == prefix:
                m["iso3"] = iso3
                m["role"] = "regional" if "_" in name else "national"
                break
    if is_diaspora(name):
        m["role"] = "diaspora"
        if name.startswith("Ashkenazi_") and "iso3" not in m:
            tail = name.split("_", 1)[1]
            m["iso3"] = {
                "Austria": "AUT", "Belarussia": "BLR", "France": "FRA",
                "Germany": "DEU", "Latvia": "LVA", "Lithuania": "LTU",
                "Poland": "POL", "Romania": "ROU", "Russia": "RUS",
                "Ukraine": "UKR",
            }.get(tail)
    if name in FR_REGIONS:
        m["fr_regions"] = FR_REGIONS[name]
    if name in FR_DEPTS:
        m["fr_depts"] = FR_DEPTS[name]
    return m


def ring_centroid(ring: list) -> tuple[float, float]:
    n = max(len(ring), 1)
    lon = sum(p[0] for p in ring) / n
    lat = sum(p[1] for p in ring) / n
    return lon, lat


def geom_centroid(geom: dict) -> tuple[float, float] | None:
    t = geom.get("type")
    if t == "Polygon":
        return ring_centroid(geom["coordinates"][0])
    if t == "MultiPolygon":
        rings = [p[0] for p in geom["coordinates"] if p]
        if not rings:
            return None
        rings.sort(key=len, reverse=True)
        return ring_centroid(rings[0])
    return None


def filter_multipolygon(geom: dict, pred) -> dict | None:
    t = geom.get("type")
    polys = []
    if t == "Polygon":
        c = ring_centroid(geom["coordinates"][0])
        if pred(*c):
            return geom
        return None
    if t == "MultiPolygon":
        for poly in geom["coordinates"]:
            c = ring_centroid(poly[0])
            if pred(*c):
                polys.append(poly)
        if not polys:
            return None
        if len(polys) == 1:
            return {"type": "Polygon", "coordinates": polys[0]}
        return {"type": "MultiPolygon", "coordinates": polys}
    return geom


def slim_feature(feat: dict, fid: str, name: str, extra: dict | None = None) -> dict:
    props = {"id": fid, "name": name}
    if extra:
        props.update(extra)
    return {
        "type": "Feature",
        "id": fid,
        "properties": props,
        "geometry": feat["geometry"],
    }


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)}  {path.stat().st_size/1024:.0f} KB")

