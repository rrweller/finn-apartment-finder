"""
/api/geocode  &  /api/reverse_geocode
Thin wrappers around geo_utils with minimal validation.
"""
from __future__ import annotations
from flask import Blueprint, request, jsonify
from geo_utils import geocode_address, reverse_geocode

bp = Blueprint("geocode", __name__, url_prefix="/api")

@bp.get("/geocode")
def fwd() -> tuple:
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"error": "q required"}), 400

    coords = geocode_address(f"{q}, Norway") or geocode_address(q)
    if not coords:
        return jsonify({"error": "not found"}), 404

    lat, lon = coords
    nice = reverse_geocode(lat, lon) or q
    return jsonify({"lat": lat, "lon": lon, "address": nice}), 200

@bp.get("/reverse_geocode")
def rev() -> tuple:
    try:
        lat, lon = float(request.args["lat"]), float(request.args["lon"])
    except (KeyError, ValueError):
        return jsonify({"error": "lat&lon required"}), 400

    addr = reverse_geocode(lat, lon)
    return (jsonify({"address": addr or ""}), 200 if addr else 404)
