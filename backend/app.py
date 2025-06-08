#App.py
# ── stdlib ───────────────────────────────────────────────────────────────
import csv, datetime, json, pathlib, time, hashlib
from typing import List

# ── 3rd-party ────────────────────────────────────────────────────────────
from flask import Flask, jsonify, request
from flask_cors import CORS
from shapely.geometry import Point, mapping, Polygon, MultiPolygon
from shapely.prepared import prep

# ── our modules ──────────────────────────────────────────────────────────
from finn_scraper import scrape_listings_polygon
from geo_utils    import geocode_address, reverse_geocode, fetch_isoline

# ----------------------------------------------------------------------------
app = Flask(__name__)
CORS(app)

BASE_DIR  = pathlib.Path(__file__).parent
DEBUG_DIR = BASE_DIR / "debug"
CACHE_DIR = BASE_DIR / "cache"
DEBUG_DIR.mkdir(exist_ok=True)
CACHE_DIR.mkdir(exist_ok=True)

PREPARED_UNION = None     # shapely.PreparedGeometry
POLY_PARAM     = ""       # the string we pass to FINN

# ─── helpers: CSV & cache ────────────────────────────────────────────────
def write_csv(p: pathlib.Path, rows: List[dict]):
    with p.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["title","price","size","type","address","lat","lon"])
        for r in rows:
            w.writerow([
                r["title"], r.get("price"), r.get("size"), r.get("type"),
                r["address"], r.get("lat"), r.get("lon")
            ])

def _cache_path(key: str, rent_max: int) -> pathlib.Path:
    return CACHE_DIR / f"{key}_{rent_max}.json"

def load_listings_cache(key: str, rent_max: int):
    fn = _cache_path(key, rent_max)
    if not fn.exists():
        return None
    data = json.loads(fn.read_text(encoding="utf-8"))
    ts   = datetime.datetime.fromisoformat(data["ts"])
    if datetime.datetime.utcnow() - ts < datetime.timedelta(hours=24):
        print(f"[Cache] HIT listings {key}")
        return data["raw"]
    print(f"[Cache] STALE listings {key}")
    return None

def save_listings_cache(key: str, rent_max: int, raw: List[dict]):
    fn = _cache_path(key, rent_max)
    payload = {"ts": datetime.datetime.utcnow().isoformat(), "raw": raw}
    fn.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"[Cache] SAVED listings {key}")

# ── build FINN’s polylocation param ───────────────────────────────────────
def build_polylocation_param(geom, max_vertices=30) -> str:
    """
    Turn a (Multi)Polygon into the "lon lat,lon lat,..." string FINN wants.
    If the geometry is a MultiPolygon, keep only the largest patch.
    """
    if isinstance(geom, MultiPolygon):
        geom = max(geom.geoms, key=lambda p: p.area)

    poly: Polygon = geom.simplify(0.0003)             # shave URL length
    coords = list(poly.exterior.coords)
    step   = max(1, len(coords) // max_vertices)
    sampled = coords[::step]
    if sampled[-1] != sampled[0]:
        sampled.append(sampled[0])                     # close ring

    return ",".join(f"{lon:.5f} {lat:.5f}" for lon, lat in sampled)

# ─── /api/isolines ───────────────────────────────────────────────────────
@app.post("/api/isolines")
def api_isolines():
    locs = request.get_json(force=True).get("locations", [])
    intersection, feats_out, modes = None, [], set()

    from shapely.geometry import shape
    for loc_idx, loc in enumerate(locs):
        minutes = int(loc.get("time", 20))
        mode    = loc.get("mode", "drive")

        if "lat" in loc and "lon" in loc:
            lat, lon = loc["lat"], loc["lon"]
        else:
            coords = geocode_address(f"{loc.get('address','')}, Norway")
            if not coords:
                print(f"[Iso] geocode miss → '{loc.get('address','')}'")
                continue
            lat, lon = coords

        fc   = fetch_isoline(lat, lon, minutes, mode)
        feats = fc.get("features", [])
        if not feats:
            continue

        for f in feats:
            f.setdefault("properties", {}).update(mode=mode, locId=loc_idx)

        feats_out.extend(feats)
        modes.add(mode)

        poly = shape(feats[0]["geometry"])
        intersection = poly if intersection is None else intersection.intersection(poly)

    global PREPARED_UNION, POLY_PARAM
    PREPARED_UNION = None
    POLY_PARAM     = ""

    if feats_out and intersection and not intersection.is_empty:
        # collapse MultiPolygon to largest patch for both the query & the map
        if isinstance(intersection, MultiPolygon):
            intersection = max(intersection.geoms, key=lambda p: p.area)

        PREPARED_UNION = prep(intersection)
        POLY_PARAM     = build_polylocation_param(intersection)

        feats_out.append({
            "type": "Feature",
            "geometry": mapping(intersection),
            "properties": {"query": True}
        })
        print(f"[Iso] OK – polygons={len(feats_out)}  modes={modes}")
    else:
        print("[Iso] ERROR – no usable polygon")

    return jsonify({"type": "FeatureCollection", "features": feats_out})

# ─── /api/listings ───────────────────────────────────────────────────────
@app.get("/api/listings")
def api_listings():
    if PREPARED_UNION is None or not POLY_PARAM:
        return jsonify({"error": "run isolines first"}), 400

    rent_min  = int(request.args.get("rent_min", 0) or 0)
    rent_max  = int(request.args.get("rent_max", 0) or 0)
    size_min  = int(request.args.get("size_min", 0) or 0)
    size_max  = int(request.args.get("size_max", 0) or 0)
    boligtype = request.args.get("boligtype", "").strip().lower()

    if rent_max <= 0:
        return jsonify({"error": "valid rent_max required"}), 400

    t0         = time.perf_counter()
    cache_hash = hashlib.sha1(POLY_PARAM.encode()).hexdigest()

    raw = load_listings_cache(cache_hash, rent_max)
    if raw is None:
        raw = scrape_listings_polygon(POLY_PARAM, rent_max)
        save_listings_cache(cache_hash, rent_max, raw)
    print(f"[List] harvested raw={len(raw)} ads")

    inside, geoc     = [], {}
    cnt_price = cnt_size = cnt_type = 0

    for ad in raw:
        price = ad.get("price") or 0
        size  = ad.get("size")  or 0
        typ   = (ad.get("type") or "").lower()

        if price < rent_min or price > rent_max:               continue
        cnt_price += 1
        if size_min and size < size_min:                       continue
        if size_max and size > size_max:                       continue
        cnt_size += 1
        if boligtype and typ != boligtype:                     continue
        cnt_type += 1

        addr = f"{ad['address']}, Norway"
        if addr not in geoc:
            geoc[addr] = geocode_address(addr)
        coords = geoc[addr]
        if not coords:
            continue
        lat, lon = coords

        if PREPARED_UNION.contains(Point(lon, lat)):
            ad.update(lat=lat, lon=lon)
            inside.append(ad)

    print(f"[Filter] price={cnt_price} size={cnt_size} type={cnt_type} "
          f"inside={len(inside)}  {time.perf_counter()-t0:0.1f}s")

    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    write_csv(DEBUG_DIR / f"{ts}_raw.csv",    raw)
    write_csv(DEBUG_DIR / f"{ts}_inside.csv", inside)

    return jsonify(inside)

# ─── /api/reverse_geocode ───────────────────────────────────────────────
@app.get("/api/reverse_geocode")
def api_reverse():
    try:
        lat, lon = float(request.args["lat"]), float(request.args["lon"])
    except (KeyError, ValueError):
        return jsonify({"error": "lat&lon required"}), 400
    addr = reverse_geocode(lat, lon)
    return jsonify({"address": addr or ""}), (200 if addr else 404)

# ----------------------------------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True, port=5000)
