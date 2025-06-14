#App.py
# ── stdlib ───────────────────────────────────────────────────────────────
import csv, datetime, json, pathlib, time, hashlib
from typing import List

# ── 3rd-party ────────────────────────────────────────────────────────────
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from shapely.geometry import Point, Polygon, MultiPolygon, mapping
from shapely.prepared import prep

# ── internal modules ─────────────────────────────────────────────────────
from finn_scraper import scrape_listings_polygon
from geo_utils    import geocode_address, reverse_geocode, fetch_isoline

# ─────────────────────────────────────────────────────────────────────────
app = Flask(
    __name__,
    static_folder=str(pathlib.Path(__file__).parent / "static"),  # ← point at build/static
    static_url_path="/static"                                     # files served at /static/…
)
CORS(app)

BASE_DIR  = pathlib.Path(__file__).parent
DEBUG_DIR = BASE_DIR / "debug"
CACHE_DIR = BASE_DIR / "cache"
DEBUG_DIR.mkdir(exist_ok=True)
CACHE_DIR.mkdir(exist_ok=True)

PREPARED_UNION = None      # precise geometry for Point-in-Polygon
POLY_PARAM     = ""        # single-ring string we pass to FINN

# ─── React build catch-all ──────────────────────────────────────
# This MUST come **after** your API routes so it only runs
# when nothing else matched (i.e. it's the last fallback).
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def react_catch_all(path):
    """
    1. In dev: show a tiny JSON stub so we know backend is up.
    2. In prod: serve real files from the React build folder.
    """
    # dev mode?  (flask run --debug or FLASK_ENV=development)
    if app.debug:
        return jsonify({"status": "backend up"}), 200

    # prod:
    build_root = pathlib.Path(app.static_folder).parent
    requested  = build_root / path

    if path != "" and requested.exists():
        # exact file (main.js, favicon, asset-manifest.json, etc.)
        return send_from_directory(build_root, path)

    # otherwise → index.html (React Router handles actual route)
    return send_from_directory(build_root, "index.html")

# ─── helpers: CSV + cache ────────────────────────────────────────────────
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

def load_cache(key: str, rent_max: int):
    fn = _cache_path(key, rent_max)
    if not fn.exists():
        return None
    data = json.loads(fn.read_text(encoding="utf-8"))
    ts   = datetime.datetime.fromisoformat(data["ts"])
    if datetime.datetime.utcnow() - ts < datetime.timedelta(hours=24):
        print(f"[Cache] HIT {key}")
        return data["raw"]
    print(f"[Cache] STALE {key}")
    return None

def save_cache(key: str, rent_max: int, raw: List[dict]):
    fn = _cache_path(key, rent_max)
    fn.write_text(
        json.dumps({"ts": datetime.datetime.utcnow().isoformat(),
                    "raw": raw},
                   ensure_ascii=False),
        encoding="utf-8")
    print(f"[Cache] SAVED {key}")

# ─── FINN polylocation builder ───────────────────────────────────────────
def build_polylocation_param(geom, max_vertices: int = 30) -> str:
    """
    Return "lon lat,lon lat,..." string.
    If *geom* is a MultiPolygon we take its convex hull so the result is
    always a single continuous ring (FINN cannot parse MultiPolygons).
    """
    if isinstance(geom, MultiPolygon):
        geom = geom.convex_hull

    poly: Polygon = geom.simplify(0.0003)            # shave URL length
    coords = list(poly.exterior.coords)
    step   = max(1, len(coords) // max_vertices)
    sampled = coords[::step]
    if sampled[-1] != sampled[0]:
        sampled.append(sampled[0])                    # close ring

    return ",".join(f"{lon:.5f} {lat:.5f}" for lon, lat in sampled)

# ─── /api/isolines ───────────────────────────────────────────────────────
@app.post("/api/isolines")
def api_isolines():
    locs  = request.get_json(force=True).get("locations", [])
    feats_out, modes = [], set()
    intersection = None

    from shapely.geometry import shape, MultiPolygon
    for idx, loc in enumerate(locs):
        minutes = int(loc.get("time", 20))
        mode    = loc.get("mode", "drive")

        lat, lon = (loc["lat"], loc["lon"]) if "lat" in loc else \
                    geocode_address(f"{loc.get('address','')}, Norway") or (None, None)
        if lat is None:
            continue

        fc = fetch_isoline(lat, lon, minutes, mode)
        if not fc.get("features"):
            continue

        for f in fc["features"]:
            f.setdefault("properties", {}).update(locId=idx, mode=mode)
        feats_out.extend(fc["features"])
        modes.add(mode)

        poly = shape(fc["features"][0]["geometry"])
        intersection = poly if intersection is None else intersection.intersection(poly)

    global PREPARED_UNION, POLY_PARAM
    PREPARED_UNION = None
    POLY_PARAM     = ""

    if feats_out and intersection and not intersection.is_empty:
        # keep the exact (multi)polygon for point-in-poly tests
        PREPARED_UNION = prep(intersection)

        # single-ring version → FINN
        from shapely.geometry import MultiPolygon
        single_ring = intersection.convex_hull if isinstance(intersection, MultiPolygon) else intersection
        POLY_PARAM  = build_polylocation_param(single_ring)

        # ► NEW: add the true intersection patch(es)
        feats_out.append({
            "type":       "Feature",
            "geometry":   mapping(intersection),
            "properties": {"intersection": True},
        })

        # ► query outline (yellow)
        feats_out.append({
            "type":       "Feature",
            "geometry":   mapping(single_ring),
            "properties": {"query": True},
        })

        print(f"[Iso] OK patches={len(intersection.geoms) if isinstance(intersection,MultiPolygon) else 1} modes={modes}")
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

    t0        = time.perf_counter()
    cache_key = hashlib.sha1(POLY_PARAM.encode()).hexdigest()

    raw = load_cache(cache_key, rent_max) \
          or scrape_listings_polygon(POLY_PARAM, rent_max)
    save_cache(cache_key, rent_max, raw)

    inside, gcache = [], {}
    cnt_price = cnt_size = cnt_type = 0

    for ad in raw:
        p = ad.get("price") or 0
        s = ad.get("size")  or 0
        t = (ad.get("type") or "").lower()

        if p < rent_min or p > rent_max:       continue
        cnt_price += 1
        if size_min and s < size_min:          continue
        if size_max and s > size_max:          continue
        cnt_size += 1
        if boligtype and t != boligtype:       continue
        cnt_type += 1

        addr = f"{ad['address']}, Norway"
        gcache.setdefault(addr, geocode_address(addr))
        coords = gcache[addr]
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

# ─────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # When you run python app.py directly (Windows dev),
    # pick sensible defaults; prod will be run by Gunicorn.
    debug = os.environ.get("FLASK_ENV") != "production"
    host  = "127.0.0.1" if debug else "0.0.0.0"
    app.run(debug=debug, host=host, port=5000)

