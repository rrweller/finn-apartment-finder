#geo_utils.py
from functools import lru_cache
from typing import List, Optional, Tuple

import os
import requests
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter
from shapely.geometry import Point, shape

# ─── Geoapify key ────────────────────────────────────────────────────────────
GEOAPIFY_KEY = os.getenv("GEOAPIFY_KEY", "").strip()

# ─── transport modes allowed ────────────────────────────────────────────────
ALLOWED_MODES = {"drive", "bicycle", "walk", "transit", "approximated_transit"}

# ─── two Nominatim pools → 2 req/s total (OSM policy-friendly) ──────────────
geoA = Nominatim(user_agent="CommuteFinder/3A", timeout=5)
geoB = Nominatim(user_agent="CommuteFinder/3B", timeout=5)

limA = RateLimiter(geoA.geocode, min_delay_seconds=0.5)
limB = RateLimiter(geoB.geocode, min_delay_seconds=0.5)
revA = RateLimiter(geoA.reverse, min_delay_seconds=0.5)
revB = RateLimiter(geoB.reverse, min_delay_seconds=0.5)


def _pick(addr: str):
    """Even-hash → pool A; odd-hash → pool B."""
    return limA if hash(addr) & 1 == 0 else limB


def _pick_rev(lat: float):
    return revA if int(lat * 1e5) & 1 == 0 else revB


# ─── forward / reverse geocode (cached) ──────────────────────────────────────
@lru_cache(maxsize=4096)
def geocode_address(address: str) -> Optional[Tuple[float, float]]:
    try:
        loc = _pick(address)(address, country_codes="no", exactly_one=True)
        if loc:
            return (loc.latitude, loc.longitude)
    except Exception:
        pass
    return None


@lru_cache(maxsize=4096)
def reverse_geocode(lat: float, lon: float) -> Optional[str]:
    try:
        loc = _pick_rev(lat)((lat, lon), exactly_one=True, language="en")
        if loc:
            return loc.address
    except Exception:
        pass
    return None


# ─── isoline helper (Geoapify) ───────────────────────────────────────────────
def fetch_isoline(lat: float, lon: float, minutes: int, mode: str) -> dict:
    if mode == "transit":
        mode = "approximated_transit"
    mode = mode if mode in ALLOWED_MODES else "drive"

    params = {
        "lat": lat,
        "lon": lon,
        "type": "time",
        "range": minutes * 60,
        "mode": mode,
        "traffic": "approximated",
        "apiKey": GEOAPIFY_KEY,
    }
    if "transit" in mode:
        params["range_type"] = "departure"

    url = "https://api.geoapify.com/v1/isoline"
    try:
        r = requests.get(url, params=params, timeout=25,
                         headers={"User-Agent": "CommuteFinder/3.3"})
        r.raise_for_status()
        return r.json()
    except requests.HTTPError as e:
        st = r.status_code
        print(f"[Iso] ERROR {st} – {'quota' if st in (403, 429) else e}")
    except Exception as e:
        print(f"[Iso] ERROR {e}")
    return {"type": "FeatureCollection", "features": []}


# ─── shapely helpers ─────────────────────────────────────────────────────────
def polygons_from_featurecollection(fc: dict) -> List:
    return [shape(f["geometry"]) for f in fc.get("features", [])]


def point_inside_any(lat: float, lon: float, polys: List) -> bool:
    return any(Point(lon, lat).within(p) for p in polys)
