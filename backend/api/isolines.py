"""
/api/isolines – build commute-time polygons & stash the exact intersection
"""
from __future__ import annotations
import hashlib, datetime as _dt
from flask import Blueprint, request, jsonify
from shapely.geometry import shape, MultiPolygon, mapping
from shapely import wkb

from config import POLY_STORE
from util.polygon import build_polylocation_param
from geo_utils import fetch_isoline, geocode_address

bp = Blueprint("isolines", __name__, url_prefix="/api")

@bp.post("/isolines")
def isolines() -> tuple:
    data        = request.get_json(force=True) or {}
    locations   = data.get("locations", [])
    features, modes = [], set()

    intersection = None
    for idx, loc in enumerate(locations):
        minutes = int(loc.get("time", 15))
        mode    = loc.get("mode", "transit")

        lat, lon = (
            (loc["lat"], loc["lon"])
            if "lat" in loc else
            geocode_address(f'{loc.get("address","")}, Norway') or (None, None)
        )
        if lat is None:
            continue

        fc = fetch_isoline(lat, lon, minutes, mode)
        if not fc.get("features"):
            continue
        for f in fc["features"]:
            f.setdefault("properties", {}).update(locId=idx, mode=mode)

        features.extend(fc["features"])
        modes.add(mode)

        poly = shape(fc["features"][0]["geometry"])
        intersection = poly if intersection is None else intersection.intersection(poly)

    if not (features and intersection and not intersection.is_empty):
        return jsonify({"error": "Could not build commute area"}), 400

    simple = intersection.convex_hull if isinstance(intersection, MultiPolygon) else intersection
    poly_param = build_polylocation_param(simple)

    # write full precision WKB for later point-in-polygon tests
    token = hashlib.sha1(poly_param.encode()).hexdigest()
    (POLY_STORE / f"{token}.wkb").write_bytes(intersection.wkb)

    # light debug layers for the map in the UI
    features.append({"type": "Feature", "geometry": mapping(intersection),
                     "properties": {"intersection": True}})
    features.append({"type": "Feature", "geometry": mapping(simple),
                     "properties": {"query": True}})

    payload = {"type": "FeatureCollection", "features": features, "token": token}
    return jsonify(payload), 200
