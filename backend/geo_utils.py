"""
Utility helpers for geocoding, isoline generation and geometry checks.
Handles     • forward geocoding     • reverse geocoding
            • isoline polygons      • point-in-polygon tests
"""
from functools import lru_cache
from typing import Optional, Tuple, List

import os
import requests
from shapely.geometry import shape, Point

GEOAPIFY_KEY = os.environ.get("GEOAPIFY_KEY", "").strip()
if not GEOAPIFY_KEY:
    raise RuntimeError(
        "Set environment variable GEOAPIFY_KEY with your key from https://www.geoapify.com/"
    )

HEADERS = {"User-Agent": "CommuteFinder/1.1"}


# ---------------------------------------------------------------------------#
#  GEOCODING
# ---------------------------------------------------------------------------#
@lru_cache(maxsize=256)
def geocode_address(address: str) -> Optional[Tuple[float, float]]:
    """Forward-geocode a string ⇒ (lat, lon).  Returns None on failure."""
    params = {
        "text": address,
        "limit": 1,
        "apiKey": GEOAPIFY_KEY,
    }
    r = requests.get(
        "https://api.geoapify.com/v1/geocode/search", params=params, headers=HEADERS, timeout=10
    )
    r.raise_for_status()
    data = r.json()
    feats = data.get("features", [])
    if not feats:
        return None
    lon, lat = feats[0]["geometry"]["coordinates"]
    return lat, lon


def reverse_geocode(lat: float, lon: float) -> Optional[str]:
    """Reverse-geocode coords ⇒ full formatted address string (or None)."""
    params = {
        "lat": lat,
        "lon": lon,
        "apiKey": GEOAPIFY_KEY,
        "limit": 1,
    }
    r = requests.get(
        "https://api.geoapify.com/v1/geocode/reverse", params=params, headers=HEADERS, timeout=10
    )
    r.raise_for_status()
    data = r.json()
    feats = data.get("features", [])
    if not feats:
        return None
    return feats[0]["properties"].get("formatted")


# ---------------------------------------------------------------------------#
#  ISOLINES
# ---------------------------------------------------------------------------#
ALLOWED_MODES = {"drive", "walk", "bicycle", "transit"}


def fetch_isoline(
    lat: float, lon: float, minutes: int, mode: str = "drive"
) -> dict:
    """
    Call Geoapify isoline API and return a GeoJSON FeatureCollection.
    """
    mode = mode if mode in ALLOWED_MODES else "drive"
    params = {
        "lat": lat,
        "lon": lon,
        "type": "time",
        "mode": mode,
        "range": minutes * 60,  # seconds
        "apiKey": GEOAPIFY_KEY,
    }
    # For public transport isolines the API needs range_type=departure
    if mode == "transit":
        params["range_type"] = "departure"
    r = requests.get("https://api.geoapify.com/v1/isoline", params=params, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.json()  # FeatureCollection


# ---------------------------------------------------------------------------#
#  SHAPELY HELPERS
# ---------------------------------------------------------------------------#
def polygons_from_featurecollection(fc: dict) -> List:
    """Convert a FeatureCollection to a list of Shapely geometries."""
    return [shape(feat["geometry"]) for feat in fc.get("features", [])]


def point_inside_any(lat: float, lon: float, polys: List) -> bool:
    """True if point is inside at least one polygon in `polys`."""
    pt = Point(lon, lat)
    return any(pt.within(poly) for poly in polys)
