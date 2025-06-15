#geo_utils.py
import datetime
import shelve
from functools import lru_cache
from typing import List, Optional, Tuple

import os
import requests
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter
from shapely.geometry import Point, shape
from filelock import FileLock
import shelve, dbm, pathlib

# ─── Geoapify key ────────────────────────────────────────────────────────────
GEOAPIFY_KEY = os.getenv("GEOAPIFY_KEY", "").strip()

# ─── transport modes allowed ─────────────────────────────────────────────────
ALLOWED_MODES = {"drive", "bicycle", "walk", "transit", "approximated_transit"}

# ─── Nominatim pools (2×0.5 s delay) ─────────────────────────────────────────
geoA = Nominatim(user_agent="CommuteFinder/3A", timeout=5)
geoB = Nominatim(user_agent="CommuteFinder/3B", timeout=5)
limA = RateLimiter(geoA.geocode, min_delay_seconds=0.5)
limB = RateLimiter(geoB.geocode, min_delay_seconds=0.5)
revA = RateLimiter(geoA.reverse, min_delay_seconds=0.5)
revB = RateLimiter(geoB.reverse, min_delay_seconds=0.5)

def _pick(addr: str):
    return limA if hash(addr) & 1 == 0 else limB

def _pick_rev(lat: float):
    return revA if int(lat * 1e5) & 1 == 0 else revB

# ─── persistent geocode cache ─────────────────────────────────────────────────
CACHE_DB   = pathlib.Path(__file__).with_name("geocode_cache.db")
CACHE_LOCK = FileLock(str(CACHE_DB) + ".lock")
TTL = datetime.timedelta(hours=24)

def _open_cache(flag: str = "r"):
    try:
        with CACHE_LOCK:                       # blocks until we have the lock
            return shelve.open(str(CACHE_DB), flag=flag, writeback=False)
    except dbm.error as exc:
        # First run, file missing → retry with 'c'
        if flag == "r" and "doesn't exist" in str(exc):
            with CACHE_LOCK:
                return shelve.open(str(CACHE_DB), flag="c", writeback=False)
        raise

def _get_cached(address: str):
    db = _open_cache("r")
    rec = db.get(address)
    if not rec:
        return None
    lat, lon, ts = rec
    ts = datetime.datetime.fromisoformat(ts)
    if datetime.datetime.utcnow() - ts < TTL:
        return (lat, lon)
    # stale
    del db[address]
    return None

def _set_cached(address: str, lat: float, lon: float):
    with _open_cache("w") as db:
        db[address] = (
            lat,
            lon,
            datetime.datetime.utcnow().isoformat(),
        )
        db.sync()

@lru_cache(maxsize=4096)
def geocode_address(address: str) -> Optional[Tuple[float, float]]:
    # 1) try disk cache
    cached = _get_cached(address)
    if cached:
        return cached
    # 2) fetch from Nominatim
    try:
        loc = _pick(address)(address, country_codes="no", exactly_one=True)
        if loc:
            lat, lon = loc.latitude, loc.longitude
            _set_cached(address, lat, lon)
            return (lat, lon)
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
        "lat": lat, "lon": lon, "type": "time",
        "range": minutes * 60, "mode": mode,
        "traffic": "approximated", "apiKey": GEOAPIFY_KEY,
    }
    if "transit" in mode:
        params["range_type"] = "departure"

    url = "https://api.geoapify.com/v1/isoline"
    try:
        r = requests.get(url, params=params, timeout=25,
                         headers={"User-Agent": "CommuteFinder/3.4"})
        r.raise_for_status()
        js = r.json()
        if not js.get("features"):
            print("[Iso] Geoapify 200 but empty. First bytes:", r.text[:200])
        return js
    except requests.HTTPError as e:
        st = r.status_code
        print(f"[Iso] HTTP {st} – {'quota' if st in (403,429) else e}")
    except Exception as e:
        print(f"[Iso] EXC – {e}")
    return {"type": "FeatureCollection", "features": []}

# ─── shapely helpers ─────────────────────────────────────────────────────────
def polygons_from_featurecollection(fc: dict) -> List:
    return [shape(f["geometry"]) for f in fc.get("features", [])]

def point_inside_any(lat: float, lon: float, polys: List) -> bool:
    return any(Point(lon, lat).within(p) for p in polys)
