"""
Flask backend for Commute-based Apartment Finder.
Implements:
    • POST /api/isolines
    • GET  /api/listings
    • GET  /api/reverse_geocode
"""
import os
from typing import List, Tuple

from flask import Flask, request, jsonify
from flask_cors import CORS
from shapely.geometry import shape

from finn_scraper import scrape_listings, KOMMUNE_TO_CODE
from geo_utils import (
    geocode_address,
    reverse_geocode,
    fetch_isoline,
    polygons_from_featurecollection,
    point_inside_any,
)

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------#
#  In-memory caches (cleared each restart)
# ---------------------------------------------------------------------------#
ISOLINE_CACHE = {}     # (address, minutes, mode) -> FeatureCollection
LISTING_CACHE = {}     # (kommune_code, max_rent)  -> [listings]
POLYGONS_LAST: List = []   # shapely polygons from last isoline request


# ---------------------------------------------------------------------------#
#  Helpers
# ---------------------------------------------------------------------------#
def resolve_kommune_code(kommune: str) -> str:
    key = kommune.lower().strip()
    if key in KOMMUNE_TO_CODE:
        return KOMMUNE_TO_CODE[key]

    # naive fallback: look once at finn redirect
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


# ---------------------------------------------------------------------------#
#  API ROUTES
# ---------------------------------------------------------------------------#
@app.route("/api/isolines", methods=["POST"])
def api_isolines():
    """
    Body JSON: {
        "locations":[
            {"address":"Some st 1, Oslo","time":20,"mode":"drive"},
            ...
        ]
    }
    Returns GeoJSON FeatureCollection (union of all isolines).
    Also records shapely polygons in POLYGONS_LAST for /api/listings use.
    """
    data = request.get_json(force=True)
    locs = data.get("locations", [])
    features, polygons = [], []

    for loc in locs:
        address = loc.get("address", "").strip()
        minutes = int(loc.get("time", 20))
        mode = loc.get("mode", "drive")
        if not address:
            continue

        cache_key = (address, minutes, mode)
        fc = ISOLINE_CACHE.get(cache_key)
        if not fc:
            coords = geocode_address(f"{address}, Norway")
            if not coords:
                continue
            lat, lon = coords
            fc = fetch_isoline(lat, lon, minutes, mode)
            ISOLINE_CACHE[cache_key] = fc

        features.extend(fc.get("features", []))
        polygons.extend(polygons_from_featurecollection(fc))

    global POLYGONS_LAST
    POLYGONS_LAST = polygons

    return jsonify({"type": "FeatureCollection", "features": features})


@app.route("/api/listings")
def api_listings():
    kommune = request.args.get("kommune", "")
    rent = int(request.args.get("rent", "0") or 0)
    if not kommune or not rent:
        return jsonify({"error": "kommune and rent required"}), 400
    if not POLYGONS_LAST:
        return jsonify({"error": "No isolines computed yet"}), 400

    kode = resolve_kommune_code(kommune)
    if not kode:
        return jsonify({"error": "Unknown kommune"}), 400

    cache_key = (kode, rent)
    listings = LISTING_CACHE.get(cache_key)
    if listings is None:
        listings = scrape_listings(kode, rent)
        LISTING_CACHE[cache_key] = listings

    # Filter by polygons
    results = []
    for lst in listings:
        coords = geocode_address(f"{lst['address']}, Norway")
        if not coords:
            continue
        lat, lon = coords
        if point_inside_any(lat, lon, POLYGONS_LAST):
            lst["lat"], lst["lon"] = lat, lon
            results.append(lst)

    return jsonify(results)


@app.route("/api/reverse_geocode")
def api_reverse():
    try:
        lat = float(request.args["lat"])
        lon = float(request.args["lon"])
    except (KeyError, ValueError):
        return jsonify({"error": "lat & lon required"}), 400

    addr = reverse_geocode(lat, lon)
    if not addr:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"address": addr})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, port=port)
