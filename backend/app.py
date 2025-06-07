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
    geocode_address, reverse_geocode,
    fetch_isoline, polygons_from_featurecollection
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
    r = requests.get("https://www.finn.no/realestate/lettings/search.html",
                     params={"q": name}, timeout=10)
    m = re.search(r"location=([\d.]+)", r.url)
    if m:
        KOMMUNE_TO_CODE[key] = m.group(1)
        return m.group(1)
    return ""


def write_csv(p: pathlib.Path, rows: List[dict]):
    with p.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["title", "price", "address", "lat", "lon"])
        for r in rows:
            w.writerow([r["title"], r["price"], r["address"],
                        r.get("lat"), r.get("lon")])


# ─── /api/isolines ───────────────────────────────────────────────────────────
@app.post("/api/isolines")
def api_isolines():
    locs = request.get_json(force=True).get("locations", [])

    intersection = None
    feats_out, modes = [], set()

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
        p = shape(feats[0]["geometry"])
        intersection = p if intersection is None else intersection.intersection(p)

    global PREPARED_UNION
    if feats_out and intersection and not intersection.is_empty:
        PREPARED_UNION = prep(intersection)
        print(f"[Iso] OK – polygons={len(feats_out)}  modes={modes}")
    else:
        PREPARED_UNION = None
        print("[Iso] ERROR – no usable polygon;"
              " see previous lines for Geoapify or geocode problems")
    return jsonify({"type": "FeatureCollection", "features": feats_out})


# ─── /api/listings ───────────────────────────────────────────────────────────
@app.get("/api/listings")
def api_listings():
    if PREPARED_UNION is None:
        return jsonify({"error": "run isolines first"}), 400

    kommune = request.args.get("kommune", "")
    rent    = int(request.args.get("rent", "0") or 0)
    code    = resolve_kommune_code(kommune)
    if not code:
        return jsonify({"error": "unknown kommune"}), 400

    t0   = time.perf_counter()
    raw  = scrape_listings(code, rent)
    ts   = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    write_csv(DEBUG_DIR / f"{ts}_raw.csv", raw)

    cache = {}
    for idx, ad in enumerate(raw, 1):
        addr = f"{ad['address']}, Norway"
        if addr not in cache:
            cache[addr] = geocode_address(addr)
            if len(cache) % 25 == 0:
                print(f"[Geo] {len(cache)} addresses  "
                      f"elapsed {time.perf_counter()-t0:0.1f}s")

    inside = []
    for ad in raw:
        latlon = cache.get(f"{ad['address']}, Norway")
        if latlon and PREPARED_UNION.contains(Point(latlon[1], latlon[0])):
            ad["lat"], ad["lon"] = latlon
            inside.append(ad)

    write_csv(DEBUG_DIR / f"{ts}_inside.csv", inside)
    print(f"[List] raw={len(raw)}  inside={len(inside)}  "
          f"time={time.perf_counter()-t0:0.1f}s")
    return jsonify(inside)


# ─── /api/reverse_geocode ────────────────────────────────────────────────────
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