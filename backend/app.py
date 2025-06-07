"""
Flask backend – v1.2
"""
import os
from typing import List

from flask import Flask, jsonify, request
from flask_cors import CORS
from shapely.geometry import shape

from finn_scraper import KOMMUNE_TO_CODE, scrape_listings
from geo_utils import (
    fetch_isoline,
    geocode_address,
    point_inside_any,
    polygons_from_featurecollection,
    reverse_geocode,
    geocode_address_fallback
)
import pathlib, csv, datetime
DBG_DIR = pathlib.Path(__file__).with_suffix("").parent / "debug"
DBG_DIR.mkdir(exist_ok=True)

RAW_FILE = "listings_raw.txt"
INSIDE_FILE = "listings_inside.txt"

app = Flask(__name__)
CORS(app)

# Always recompute isolines (they’re cheap) – no cache now
POLYGONS_LAST: List = []  # latest polygons for listing-filter


# ─────────────────────────────────────────────────────────────────────────────
#  Helper – find Finn kommune code
# ─────────────────────────────────────────────────────────────────────────────
def resolve_kommune_code(kommune: str) -> str:
    key = kommune.lower().strip()
    if key in KOMMUNE_TO_CODE:
        return KOMMUNE_TO_CODE[key]

    # quick one-shot discovery
    import re, requests

    r = requests.get(
        "https://www.finn.no/realestate/lettings/search.html",
        params={"q": kommune},
        timeout=10,
    )
    m = re.search(r"location=([\d.]+)", r.url)
    if m:
        KOMMUNE_TO_CODE[key] = m.group(1)
        return m.group(1)
    return ""


# ─────────────────────────────────────────────────────────────────────────────
#  API
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/api/isolines")
def api_isolines():
    """
    Body: {"locations":[{"address":..,"time":..,"mode":..}, ...]}
    Returns GeoJSON FeatureCollection with property `mode` on each feature.
    Stores shapely polygons for later filtering.
    """
    data = request.get_json(force=True)
    locs = data.get("locations", [])
    features, polygons = [], []

    for loc in locs:
        addr = loc.get("address", "").strip()
        if not addr:
            continue
        minutes = int(loc.get("time", 20))
        mode = loc.get("mode", "drive")

        coords = geocode_address(f"{addr}, Norway")
        if not coords:
            continue
        lat, lon = coords
        fc = fetch_isoline(lat, lon, minutes, mode)

        for feat in fc.get("features", []):
            feat.setdefault("properties", {})["mode"] = mode
            features.append(feat)

        polygons.extend(polygons_from_featurecollection(fc))

    global POLYGONS_LAST, LAST_ISOLINE_HASH
    POLYGONS_LAST = polygons
    LAST_ISOLINE_HASH = hash(str(features))  # simple fingerprint
    print(f"[Iso] calc OK – {len(polygons)} polygon(s), modes:"
          f" {set(f['properties']['mode'] for f in features)}")

    return jsonify({"type": "FeatureCollection", "features": features})


@app.get("/api/listings")
def api_listings():
    komm  = request.args.get("kommune", "")
    rent  = int(request.args.get("rent", "0") or 0)

    if not komm or not rent:
        return jsonify({"error": "kommune & rent needed"}), 400
    if not POLYGONS_LAST:
        return jsonify({"error": "run isolines first"}), 400

    kode = resolve_kommune_code(komm)
    if not kode:
        return jsonify({"error": "unknown kommune"}), 400

    raw = scrape_listings(kode, rent)

    geocoded, inside = [], []
    FAIL_LIMIT = 30          # max per-request debug lines

    def dbg(msg):
        if len(inside) + len(geocoded) < FAIL_LIMIT:
            print("   ↳", msg)

    for ad in raw:
        addr = f"{ad['address']}, Norway"
        coords = geocode_address(addr) or geocode_address_fallback(addr)
        if not coords:
            dbg(f"no geocode → {addr}")
            continue

        lat, lon = coords
        ad["lat"], ad["lon"] = lat, lon
        geocoded.append(ad)

        if point_inside_any(lat, lon, POLYGONS_LAST):
            inside.append(ad)
        else:
            dbg(f"outside polygon → {addr}")

    # ----- write debug CSVs -------------------------------------------------
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    raw_path    = DBG_DIR / f"{ts}_raw.csv"
    inside_path = DBG_DIR / f"{ts}_inside.csv"

    def dump_csv(path, ads):
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["title", "price", "address", "lat", "lon"])
            for a in ads:
                w.writerow([a["title"], a["price"], a["address"],
                            a.get("lat"), a.get("lon")])

    dump_csv(raw_path,    geocoded)          # only those we could geocode
    dump_csv(inside_path, inside)

    print(f"[List] raw={len(raw)}  geocoded={len(geocoded)}  "
          f"inside={len(inside)}  ⟶ {inside_path}")

    return jsonify(inside)

@app.get("/api/reverse_geocode")
def api_reverse():
    try:
        lat = float(request.args["lat"])
        lon = float(request.args["lon"])
    except (KeyError, ValueError):
        return jsonify({"error": "lat&lon required"}), 400
    addr = reverse_geocode(lat, lon)
    if not addr:
        return jsonify({"error": "not found"}), 404
    return jsonify({"address": addr})


if __name__ == "__main__":
    app.run(debug=True, port=int(os.getenv("PORT", 5000)))
