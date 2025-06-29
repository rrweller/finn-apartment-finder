"""
/api/listings – query FINN for ads within the stored polygon,
apply post-filters and return matches.
"""
from __future__ import annotations
import hashlib, time
from pathlib import Path
from typing import Iterable, Set
from flask import Blueprint, request, jsonify
from shapely.geometry import Point
from shapely.prepared import prep
from shapely import wkb

from config import POLY_STORE, LISTING_TTL_H
from util import cache as c
from util.polygon import build_polylocation_param
from finn_scraper import scrape_listings_polygon
from geo_utils import geocode_address

bp = Blueprint("listings", __name__, url_prefix="/api")

def _parse_csv_list(raw: str) -> Set[str]:
    return {v.strip().lower() for v in raw.split(",") if v.strip()}

@bp.get("/listings")
def listings() -> tuple:
    token = request.args.get("token", "").strip()
    if not token:
        return jsonify({"error": "token missing"}), 400

    poly_fp = POLY_STORE / f"{token}.wkb"
    if not poly_fp.exists():
        return jsonify({"error": "invalid token"}), 400

    geom           = wkb.loads(poly_fp.read_bytes())
    prepared_union = prep(geom)
    poly_param     = build_polylocation_param(geom)

    # ---------- URL params ---------------------------------------------------
    rent_min  = int(request.args.get("rent_min", 0) or 0)
    rent_max  = int(request.args.get("rent_max", 0) or 9_999_999)
    size_min  = int(request.args.get("size_min", 0) or 0)
    size_max  = int(request.args.get("size_max", 0) or 0)
    bed_min   = int(request.args.get("min_bedrooms", 0) or 0)
    listing_mode = request.args.get("mode", "rent").lower()

    type_list     = _parse_csv_list(request.args.get("boligtype", ""))
    facility_list = _parse_csv_list(request.args.get("facilities", ""))
    floor_list    = _parse_csv_list(request.args.get("floor", ""))

    # ---------- cache signature ---------------------------------------------
    sig_parts: Iterable[str] = (
        poly_param, str(rent_min), str(rent_max), str(size_min), str(size_max),
        str(bed_min), ",".join(sorted(type_list)), ",".join(sorted(facility_list)),
        ",".join(sorted(floor_list)), listing_mode,
    )
    cache_key = hashlib.sha1("|".join(sig_parts).encode()).hexdigest()
    cache_fp  = c.cache_path(cache_key)

    # ---------- load / scrape ------------------------------------------------
    with c.with_lock(cache_fp):
        raw = c.load(cache_key, LISTING_TTL_H)
        if raw is None:
            raw = scrape_listings_polygon(
                poly_param,
                rent_min or None,
                rent_max,
                listing_mode=listing_mode,
                property_types=type_list,
                facilities=facility_list,
                floors=floor_list,
                area_from=size_min or None,
                area_to=size_max or None,
                bedrooms_min=bed_min or None,
            )
            c.save(cache_key, raw)

    # ---------- post-filter & geocode ---------------------------------------
    inside, gcache = [], {}
    t0 = time.perf_counter()
    for ad in raw:
        price = ad.get("price") or 0
        if not (rent_min <= price <= rent_max):
            continue
        size = ad.get("size") or 0
        if (size_min and size < size_min) or (size_max and size > size_max):
            continue

        addr = f"{ad['address']}, Norway"
        gcache.setdefault(addr, geocode_address(addr))
        coords = gcache[addr]
        if not coords:
            continue
        lat, lon = coords
        if prepared_union.contains(Point(lon, lat)):
            ad.update(lat=lat, lon=lon)
            inside.append(ad)

    print(f"[Filter] inside={len(inside)}  {time.perf_counter()-t0:0.1f}s")
    return jsonify(inside), 200
