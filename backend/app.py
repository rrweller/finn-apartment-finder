#App.py
import csv, datetime, pathlib, time
from typing import List
from flask import Flask, jsonify, request
from flask_cors import CORS
from shapely.geometry import Point
from shapely.prepared import prep
from shapely.ops import unary_union
from finn_scraper import KOMMUNE_TO_CODE, scrape_listings
from geo_utils import (
    geocode_address,
    reverse_geocode,
    fetch_isoline,
    polygons_from_featurecollection,
)

app = Flask(__name__)
CORS(app)

PREPARED_UNION = None
DEBUG_DIR = pathlib.Path(__file__).with_suffix("").parent / "debug"
DEBUG_DIR.mkdir(exist_ok=True)


def resolve_kommune_code(name: str) -> str:
    key = name.lower().strip()
    if key in KOMMUNE_TO_CODE:
        return KOMMUNE_TO_CODE[key]
    import re, requests
    r = requests.get(
        "https://www.finn.no/realestate/lettings/search.html",
        params={"q": name},
        timeout=10,
    )
    m = re.search(r"location=([\d.]+)", r.url)
    if m:
        KOMMUNE_TO_CODE[key] = m.group(1)
        return m.group(1)
    return ""


def write_csv(p: pathlib.Path, rows: List[dict]):
    with p.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["title", "price", "size", "type", "address", "lat", "lon"])
        for r in rows:
            w.writerow([
                r["title"],
                r.get("price"),
                r.get("size"),
                r.get("type"),
                r["address"],
                r.get("lat"),
                r.get("lon"),
            ])


@app.post("/api/isolines")
def api_isolines():
    locs = request.get_json(force=True).get("locations", [])
    intersection, feats_out, modes = None, [], set()

    for loc in locs:
        minutes = int(loc.get("time", 20))
        mode    = loc.get("mode", "drive")

        if "lat" in loc and "lon" in loc:
            lat, lon = loc["lat"], loc["lon"]
        else:
            addr = loc.get("address", "").strip()
            coords = geocode_address(f"{addr}, Norway") if addr else None
            if not coords:
                print(f"[Iso] geocode miss → '{addr}'")
                continue
            lat, lon = coords

        fc = fetch_isoline(lat, lon, minutes, mode)
        feats = fc.get("features", [])
        if not feats:
            print("[Iso] empty isoline")
            continue
        for f in feats:
            f.setdefault("properties", {})["mode"] = mode
        feats_out.extend(feats)
        modes.add(mode)

        from shapely.geometry import shape
        poly = shape(feats[0]["geometry"])
        intersection = poly if intersection is None else intersection.intersection(poly)

    global PREPARED_UNION
    if feats_out and intersection and not intersection.is_empty:
        PREPARED_UNION = prep(intersection)
        print(f"[Iso] OK – polygons={len(feats_out)}  modes={modes}")
    else:
        PREPARED_UNION = None
        print("[Iso] ERROR – no usable polygon")

    return jsonify({"type": "FeatureCollection", "features": feats_out})


@app.get("/api/listings")
def api_listings():
    if PREPARED_UNION is None:
        return jsonify({"error": "run isolines first"}), 400

    # pull in all filter args
    kommune   = request.args.get("kommune", "")
    rent_min  = int(request.args.get("rent_min", "0")  or 0)
    rent_max  = int(request.args.get("rent_max", "0")  or 0)
    size_min  = int(request.args.get("size_min", "0")  or 0)
    size_max  = int(request.args.get("size_max", "0")  or 0)
    boligtype = request.args.get("boligtype", "").strip().lower()

    # sanity check
    if not kommune or rent_max <= 0:
        return jsonify({"error": "kommune & valid rent_max required"}), 400

    code = resolve_kommune_code(kommune)
    if not code:
        return jsonify({"error": "unknown kommune"}), 400

    t0  = time.perf_counter()
    raw = scrape_listings(code, rent_max)
    print(f"[List] harvested raw={len(raw)} ads (price_to={rent_max})")

    # stage counters
    cnt_price = cnt_size = cnt_type = 0

    inside = []
    cache  = {}

    for ad in raw:
        price = ad.get("price") or 0
        size  = ad.get("size")  or 0
        typ   = (ad.get("type") or "").lower()

        # price filter
        if price < rent_min or price > rent_max:
            continue
        cnt_price += 1

        # size_min
        if size_min and size < size_min:
            continue
        # size_max
        if size_max and size > size_max:
            continue
        cnt_size += 1

        # type filter
        if boligtype and typ != boligtype:
            continue
        cnt_type += 1

        # geocode once per unique address
        addr = f"{ad['address']}, Norway"
        if addr not in cache:
            cache[addr] = geocode_address(addr)
        coords = cache[addr]
        if not coords:
            continue
        lat, lon = coords

        # polygon test
        if PREPARED_UNION.contains(Point(lon, lat)):
            ad["lat"], ad["lon"] = lat, lon
            inside.append(ad)

    # debug output
    print(f"[Filter] after price={cnt_price}, size={cnt_size}, type={cnt_type}, inside={len(inside)} "
          f"in {time.perf_counter()-t0:0.1f}s")

    # write CSVs (optional)
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    write_csv(DEBUG_DIR / f"{ts}_raw.csv", raw)
    write_csv(DEBUG_DIR / f"{ts}_inside.csv", inside)

    return jsonify(inside)

@app.get("/api/reverse_geocode")
def api_reverse():
    try:
        lat, lon = float(request.args["lat"]), float(request.args["lon"])
    except (KeyError, ValueError):
        return jsonify({"error": "lat&lon required"}), 400
    addr = reverse_geocode(lat, lon)
    return jsonify({"address": addr or ""}), (200 if addr else 404)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
