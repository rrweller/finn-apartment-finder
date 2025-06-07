"""
Geo helpers: geocoding, reverse-geocoding, isolines, shapely
"""
import os
from functools import lru_cache
from typing import List, Optional, Tuple

import requests
from shapely.geometry import Point, shape
import urllib.parse as _u

GEOAPIFY_KEY = os.getenv("GEOAPIFY_KEY", "").strip()
if not GEOAPIFY_KEY:
    raise RuntimeError("Set GEOAPIFY_KEY in your environment.")

HEADERS = {"User-Agent": "CommuteFinder/1.2"}

ALLOWED_MODES = {"drive", "transit", "bicycle", "walk", "approximated_transit"}

_GEOCODE_URL_NOMINATIM = "https://nominatim.openstreetmap.org/search"


# ─────────────────────────────────────────────────────────────────────────────
#  Geocoding
# ─────────────────────────────────────────────────────────────────────────────
@lru_cache(maxsize=256)
def geocode_address(address: str) -> Optional[Tuple[float, float]]:
    params = {"text": address, "limit": 1, "apiKey": GEOAPIFY_KEY}
    r = requests.get(
        "https://api.geoapify.com/v1/geocode/search",
        params=params,
        headers=HEADERS,
        timeout=10,
    )
    r.raise_for_status()
    feats = r.json().get("features", [])
    if not feats:
        return None
    lon, lat = feats[0]["geometry"]["coordinates"]
    return lat, lon


def reverse_geocode(lat: float, lon: float) -> Optional[str]:
    params = {"lat": lat, "lon": lon, "limit": 1, "apiKey": GEOAPIFY_KEY}
    r = requests.get(
        "https://api.geoapify.com/v1/geocode/reverse",
        params=params,
        headers=HEADERS,
        timeout=10,
    )
    r.raise_for_status()
    feats = r.json().get("features", [])
    if not feats:
        return None
    return feats[0]["properties"].get("formatted")


# ─────────────────────────────────────────────────────────────────────────────
#  Isolines
# ─────────────────────────────────────────────────────────────────────────────
def fetch_isoline(lat: float, lon: float, minutes: int, mode: str = "drive") -> dict:
    """
    Call Geoapify Isoline API => GeoJSON FeatureCollection.

    We translate UI's "transit" into Geoapify's `approximated_transit`
    so that Oslo (and most other cities) get the same generous coverage
    as CommuteTimeMap.
    """
    if mode == "transit":
        mode = "approximated_transit"      # <── real fix
    mode = mode if mode in ALLOWED_MODES | {"approximated_transit"} else "drive"

    params = {
        "lat": lat,
        "lon": lon,
        "type": "time",
        "range": minutes * 60,
        "mode": mode,
        "traffic": "approximated",
        "range_type": "departure",
        "apiKey": GEOAPIFY_KEY,
    }
    url = "https://api.geoapify.com/v1/isoline"
    print("[Iso] GET", url, params)        # debug
    r = requests.get(url, params=params, headers=HEADERS, timeout=25)
    r.raise_for_status()
    return r.json()


# ─────────────────────────────────────────────────────────────────────────────
#  Shapely helpers
# ─────────────────────────────────────────────────────────────────────────────
def polygons_from_featurecollection(fc: dict) -> List:
    return [shape(feat["geometry"]) for feat in fc.get("features", [])]


def point_inside_any(lat: float, lon: float, polys: List) -> bool:
    pt = Point(lon, lat)
    return any(pt.within(poly) for poly in polys)

def geocode_address_fallback(address: str) -> Optional[Tuple[float, float]]:
    """
    Try Nominatim when Geoapify fails (strict rate-limit: 1/s).
    """
    q = {"q": address, "format": "json", "limit": 1}
    try:
        r = requests.get(_GEOCODE_URL_NOMINATIM, params=q, headers={"User-Agent": "CommuteFinder"}, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        pass
    return None
