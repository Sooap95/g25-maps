def build_world() -> dict:
    src = load_json(GEO / "ne_110m_countries.geojson")
    out = []
    for f in src["features"]:
        p = f["properties"]
        iso = p.get("ADM0_A3") or p.get("ISO_A3")
        if not iso or iso in ("-99", "-1"):
            continue
        name = p.get("NAME") or p.get("ADMIN") or iso
        feat = slim_feature(f, iso, name, {"kind": "country", "iso3": iso})
        out.append(feat)
    return {"type": "FeatureCollection", "features": out}


def build_europe() -> dict:
    src = load_json(GEO / "ne_50m_countries.geojson")
    out = []
    for f in src["features"]:
        p = f["properties"]
        iso = p.get("ADM0_A3") or p.get("ISO_A3")
        if not iso or iso in ("-99", "-1"):
            continue
        cont = p.get("CONTINENT")
        if cont != "Europe" and iso not in EUROPE_ISO_EXTRA:
            continue
        geom = f["geometry"]
        if iso == "FRA":
            clipped = filter_multipolygon(
                geom, lambda lon, lat: -6.5 <= lon <= 10.5 and 41.0 <= lat <= 51.6
            )
            if not clipped:
                continue
            f = {**f, "geometry": clipped}
        name = p.get("NAME") or iso
        out.append(slim_feature(f, iso, name, {"kind": "country", "iso3": iso}))
    return {"type": "FeatureCollection", "features": out}


def build_france_regions() -> dict:
    src = load_json(GEO / "france_regions.geojson")
    out = []
    for f in src["features"]:
        p = f["properties"]
        code = p["code"]
        fid = f"FR-{code}"
        out.append(slim_feature(f, fid, p["nom"], {
            "kind": "region", "iso3": "FRA", "insee": code,
        }))
    return {"type": "FeatureCollection", "features": out}


def build_france_depts() -> dict:
    src = load_json(GEO / "france_depts.geojson")
    out = []
    for f in src["features"]:
        p = f["properties"]
        code = p["code"]
        fid = f"FD-{code}"
        region = DEPT_TO_REGION.get(code)
        out.append(slim_feature(f, fid, p["nom"], {
            "kind": "dept", "iso3": "FRA", "insee": code,
            "region": region, "parent": f"FR-{region}" if region else None,
        }))
    return {"type": "FeatureCollection", "features": out}


def build_west_europe(france_regions: dict) -> dict:
    features = []
    features.extend(france_regions["features"])
    nuts1 = load_json(GEO / "nuts1.geojson")
    nuts2 = load_json(GEO / "nuts2.geojson")
    nuts1_keep = {"BE", "DE", "UK", "AT", "NL"}
    for f in nuts1["features"]:
        p = f["properties"]
        cc = p.get("CNTR_CODE")
        if cc not in nuts1_keep:
            continue
        nid = p["NUTS_ID"]
        iso = p.get("ISO3_CODE") or {
            "BE": "BEL", "DE": "DEU", "UK": "GBR", "AT": "AUT", "NL": "NLD",
        }.get(cc)
        features.append(slim_feature(f, f"NUTS-{nid}", p.get("NAME_LATN") or nid, {
            "kind": "nuts1", "iso3": iso, "nuts": nid, "cntr": cc,
        }))
    nuts2_keep = {"ES", "IT", "CH"}
    for f in nuts2["features"]:
        p = f["properties"]
        cc = p.get("CNTR_CODE")
        if cc not in nuts2_keep:
            continue
        nid = p["NUTS_ID"]
        iso = p.get("ISO3_CODE") or {"ES": "ESP", "IT": "ITA", "CH": "CHE"}.get(cc)
        features.append(slim_feature(f, f"NUTS-{nid}", p.get("NAME_LATN") or nid, {
            "kind": "nuts2", "iso3": iso, "nuts": nid, "cntr": cc,
        }))
    europe = load_json(GEO / "ne_50m_countries.geojson")
    for f in europe["features"]:
        p = f["properties"]
        iso = p.get("ADM0_A3")
        if iso not in {"IRL", "PRT", "DNK", "LUX", "ISL"}:
            continue
        geom = f["geometry"]
        if iso == "PRT":
            clipped = filter_multipolygon(
                geom, lambda lon, lat: lat > 36.5 and lon > -10
            )
            if clipped:
                f = {**f, "geometry": clipped}
        features.append(slim_feature(f, iso, p.get("NAME") or iso, {
            "kind": "country", "iso3": iso,
        }))
    return {"type": "FeatureCollection", "features": features}


def attach_fallbacks(samples: list[dict]) -> None:
    by_name = {s["n"]: s for s in samples}
    assigned_depts: set[str] = set()
    for s in samples:
        for d in s.get("fr_depts") or []:
            assigned_depts.add(d)
    for dept, region in DEPT_TO_REGION.items():
        if dept in assigned_depts:
            continue
        default_name = REGION_DEFAULT.get(region)
        if default_name and default_name in by_name:
            by_name[default_name].setdefault("fr_depts", [])
            if dept not in by_name[default_name]["fr_depts"]:
                by_name[default_name]["fr_depts"].append(dept)
    assigned_regions = set()
    for s in samples:
        for r in s.get("fr_regions") or []:
            assigned_regions.add(r)
    for region, default_name in REGION_DEFAULT.items():
        if region in assigned_regions:
            continue
        if default_name in by_name:
            by_name[default_name].setdefault("fr_regions", [])
            if region not in by_name[default_name]["fr_regions"]:
                by_name[default_name]["fr_regions"].append(region)


def main() -> None:
    MAPS.mkdir(parents=True, exist_ok=True)
    raw = parse_g25(OUT / "g25_modern_scaled.txt")
    samples = []
    unmapped = []
    for row in raw:
        meta = map_sample(row["n"])
        rec = {**row, **meta}
        if "iso3" not in rec and rec.get("role") != "diaspora":
            unmapped.append(row["n"])
        samples.append(rec)
    attach_fallbacks(samples)
    print(f"samples: {len(samples)}  unmapped: {len(unmapped)}")
    if unmapped:
        print("  ", ", ".join(unmapped[:40]), ("..." if len(unmapped) > 40 else ""))
    write_json(OUT / "samples.json", {
        "source": "Eurogenes Global25 modern population averages (scaled)",
        "dims": 25,
        "metric": "euclidean",
        "samples": samples,
    })
    world = build_world()
    europe = build_europe()
    france = build_france_regions()
    depts = build_france_depts()
    west = build_west_europe(france)
    write_json(MAPS / "world.geojson", world)
    write_json(MAPS / "europe.geojson", europe)
    write_json(MAPS / "west-europe.geojson", west)
    write_json(MAPS / "france.geojson", france)
    write_json(MAPS / "france-depts.geojson", depts)
    write_json(MAPS / "catalog.json", {
        "maps": [
            {"id": "world", "title": "Monde", "file": "data/maps/world.geojson", "view": [[-55, -140], [75, 170]], "kind": "country"},
            {"id": "europe", "title": "Europe", "file": "data/maps/europe.geojson", "view": [[34.5, -25], [71.5, 42]], "kind": "country"},
            {"id": "west-europe", "title": "Europe de l'Ouest", "file": "data/maps/west-europe.geojson", "view": [[35.5, -12], [60.5, 19]], "kind": "subnational"},
            {"id": "france", "title": "France — régions", "file": "data/maps/france.geojson", "view": [[41.2, -5.8], [51.2, 9.8]], "kind": "region"},
            {"id": "france-depts", "title": "France — départements", "file": "data/maps/france-depts.geojson", "view": [[41.2, -5.8], [51.2, 9.8]], "kind": "dept"},
        ]
    })
    print("done")


if __name__ == "__main__":
    main()
