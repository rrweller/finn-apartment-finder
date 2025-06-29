"""
Global paths and config switches.
Feel free to move secrets (e.g. API keys) to env-vars or a .env file.
"""
from pathlib import Path
import os

BASE_DIR   = Path(__file__).resolve().parent
DEBUG_DIR  = BASE_DIR / "debug"
CACHE_DIR  = BASE_DIR / "cache"
POLY_STORE = CACHE_DIR / "polygons"
ROUTE_DIR  = CACHE_DIR / "routes"

# create folders on import
for d in (DEBUG_DIR, CACHE_DIR, POLY_STORE, ROUTE_DIR):
    d.mkdir(exist_ok=True)

#: gunicorn workers timeout after 600 s – keep locks safely below that
LOCK_TIMEOUT_SEC = 570

#: how long listings / routes stay fresh on disk
LISTING_TTL_H   = 72
ROUTE_TTL_H     = 24
CACHE_PURGE_D   = 7
