"""
/api/routes – fetch (and cache) Geoapify routes origin→destinations
"""
from __future__ import annotations
import hashlib, datetime as _dt
from pathlib import Path
from flask import Blueprint, request, jsonify
import requests

from config import ROUTE_DIR, ROUTE_TTL_H
from util import cache as c
from geo_utils import GEOAPIFY_KEY

bp = Blueprint("commute", __name__, url_prefix="/api")

def _route_cache_path(key: str) -> Path:
    return ROUTE_DIR / f"{key}.json"

def _load_route_cache(key: str):
    fn = _route_cache_path(key)
    if not fn.exists():
        return None
    meta = c.load(key, ROUTE_TTL_H)       # reuse util.cache but different store
    return meta

def _save_route_cache(key: str, geojson: dict):
    c.save(key, geojson)                   # util.cache handles ttl / purge

def _fetch_route(olat, olon, dlat, dlon, pref_mode):
    modes = (
        [pref_mode, "walk", "approximated_transit"]
        if pref_mode not in ("transit", "approximated_transit")
        else [pref_mode, "approximated_transit", "walk"]
    )
    for mode in modes:
        try:
            r = requests.get(
                "https://api.geoapify.com/v1/routing",
                params={
                    "waypoints": f"{olat},{olon}|{dlat},{dlon}",
                    "mode": mode,
                    "apiKey": GEOAPIFY_KEY,
                    "details": "instruction_details",
                    "format": "geojson",
                },
                timeout=20,
                headers={"User-Agent": "CommuteFinder/3.6"},
            )
            r.raise_for_status()
            js = r.json()
            if js.get("features"):
                if mode != pref_mode:
                    print(f"[Route] fallback {pref_mode}→{mode}")
                return js
        except Exception as exc:           # covers HTTPError & timeouts
            print(f"[Route] {mode} failed – {exc}")
    return {}

@bp.post("/routes")
def routes():                              # noqa: C901 – a bit long, but clear
    js = request.get_json(force=True) or {}
    try:
        olat, olon = js["origin"]["lat"], js["origin"]["lon"]
        targets    = js["targets"]
    except (KeyError, TypeError):
        return jsonify({"error": "Bad payload"}), 400

    feats = []
    for t in targets:
        dlat, dlon = t["lat"], t["lon"]
        mode       = t.get("mode", "drive") or "drive"
        locId      = t.get("locId", 0)

        cache_key = hashlib.sha1(
            f"{olat:.5f},{olon:.5f}->{dlat:.5f},{dlon:.5f}@{mode}".encode()
        ).hexdigest()

        geo = _load_route_cache(cache_key)
        if geo is None:
            geo = _fetch_route(olat, olon, dlat, dlon, mode)
            if geo:
                _save_route_cache(cache_key, geo)

        if not geo or not geo.get("features"):
            print("[Route] WARN empty response", cache_key)
            continue

        feat = geo["features"][0]
        feat.setdefault("properties", {}).update(locId=locId)
        feats.append(feat)

    return jsonify({"type": "FeatureCollection", "features": feats}), 200
