#app.py
# ── stdlib ───────────────────────────────────────────────────────────────
import csv, datetime, json, pathlib, time, hashlib, os, tempfile, shutil
from typing import List, Tuple

# ── 3rd-party ────────────────────────────────────────────────────────────
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from shapely.geometry import Point, Polygon, MultiPolygon, mapping
from shapely.prepared import prep

# ── internal modules ─────────────────────────────────────────────────────
from finn_scraper import scrape_listings_polygon
from geo_utils    import geocode_address, reverse_geocode, fetch_isoline

# ─────────────────────────────────────────────────────────────────────────

# ░░ 0.  Flask scaffold ░░
BASE_DIR   = pathlib.Path(__file__).parent
DEBUG_DIR  = BASE_DIR / "debug"
CACHE_DIR  = BASE_DIR / "cache"
DEBUG_DIR.mkdir(exist_ok=True)
CACHE_DIR.mkdir(exist_ok=True)

app = Flask(
    __name__,
    static_folder=str(BASE_DIR / "static"),   # React build goes here
    static_url_path="/static"
)
CORS(app)

PREPARED_UNION = None      # shapely prepared polygon for fast tests
POLY_PARAM     = ""        # "lon lat,lon lat,…" sent to FINN


# ░░ 1.  React build fallback ░░
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def react_catch_all(path):
    if app.debug:
        return jsonify({"status": "backend up"}), 200

    build_root = pathlib.Path(app.static_folder).parent
    requested  = build_root / path
    if path and requested.exists():
        return send_from_directory(build_root, path)
    return send_from_directory(build_root, "index.html")


# ░░ 2.  helpers (CSV + atomic cache) ░░
def write_csv(p: pathlib.Path, rows: List[dict]):
    with p.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["title","price","size","type","address","lat","lon"])
        for r in rows:
            w.writerow([
                r["title"], r.get("price"), r.get("size"), r.get("type"),
                r["address"], r.get("lat"), r.get("lon")
            ])

def _atomic_write(path: pathlib.Path, data: dict):
    fd, tmp = tempfile.mkstemp(dir=str(path.parent))
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    shutil.move(tmp, path)           # atomic rename on same FS

def _cache_path(key: str, rent_max: int) -> pathlib.Path:
    return CACHE_DIR / f"{key}_{rent_max}.json"

def load_cache(key: str, rent_max: int):
    fn = _cache_path(key, rent_max)
    if not fn.exists():
        return None
    meta = json.loads(fn.read_text(encoding="utf-8"))
    ts   = datetime.datetime.fromisoformat(meta["ts"])
    if datetime.datetime.utcnow() - ts < datetime.timedelta(hours=24):
        print(f"[Cache]  HIT  {key}")
        return meta["raw"]
    print(f"[Cache]  STALE {key}")
    return None

def save_cache(key: str, rent_max: int, raw: List[dict]):
    fn = _cache_path(key, rent_max)
    payload = {"ts": datetime.datetime.utcnow().isoformat(), "raw": raw}
    _atomic_write(fn, payload)
    print(f"[Cache]  SAVED {key}")


# ░░ 3.  FINN poly-location helper ░░
def build_polylocation_param(geom, max_vertices: int = 30) -> str:
    """Return 'lon lat,lon lat,…' string for FINN map polygon."""
    if isinstance(geom, MultiPolygon):
        geom = geom.convex_hull                                # single ring
    poly: Polygon = geom.simplify(0.0003)                      # shave URL
    step          = max(1, len(poly.exterior.coords) // max_vertices)
    pts           = list(poly.exterior.coords)[::step]
    if pts[-1] != pts[0]:
        pts.append(pts[0])
    return ",".join(f"{lon:.5f} {lat:.5f}" for lon, lat in pts)


# ░░ 4.  /api/isolines ░░
@app.post("/api/isolines")
def api_isolines():
    locs        = request.get_json(force=True).get("locations", [])
    feats_out   = []
    modes       = set()
    intersection= None

    from shapely.geometry import shape, MultiPolygon
    for idx, loc in enumerate(locs):
        minutes = int(loc.get("time", 20))
        mode    = loc.get("mode", "drive")

        lat, lon = (loc.get("lat"), loc.get("lon")) if "lat" in loc else \
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
        PREPARED_UNION = prep(intersection)

        single = (intersection.convex_hull
                  if isinstance(intersection, MultiPolygon) else intersection)
        POLY_PARAM = build_polylocation_param(single)

        # add debug layers
        feats_out.append({"type":"Feature","geometry":mapping(intersection),
                          "properties":{"intersection":True}})
        feats_out.append({"type":"Feature","geometry":mapping(single),
                          "properties":{"query":True}})

        print(f"[Iso] OK  modes={modes}")
    else:
        print("[Iso] ERROR – no usable polygon")

    return jsonify({"type":"FeatureCollection","features":feats_out})


# ░░ 5.  /api/listings ░░
@app.get("/api/listings")
def api_listings():
    if PREPARED_UNION is None or not POLY_PARAM:
        return jsonify({"error":"run isolines first"}), 400

    rent_min  = int(request.args.get("rent_min",0) or 0)
    rent_max  = int(request.args.get("rent_max",0) or 0)
    size_min  = int(request.args.get("size_min",0) or 0)
    size_max  = int(request.args.get("size_max",0) or 0)
    boligtype = request.args.get("boligtype","").strip().lower()
    if rent_max <= 0:
        return jsonify({"error":"valid rent_max required"}), 400

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

        if p < rent_min or p > rent_max:           continue
        cnt_price += 1
        if size_min and s < size_min:              continue
        if size_max and s > size_max:              continue
        cnt_size += 1
        if boligtype and t != boligtype:           continue
        cnt_type += 1

        addr = f"{ad['address']}, Norway"
        gcache.setdefault(addr, geocode_address(addr))
        coords = gcache[addr]
        if not coords:                             continue
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


# ░░ 6.  /api/reverse_geocode ░░
@app.get("/api/reverse_geocode")
def api_reverse():
    try:
        lat, lon = float(request.args["lat"]), float(request.args["lon"])
    except (KeyError, ValueError):
        return jsonify({"error":"lat&lon required"}), 400
    addr = reverse_geocode(lat, lon)
    return jsonify({"address":addr or ""}), (200 if addr else 404)


# ░░ 7.  dev entry-point ░░
if __name__ == "__main__":
    debug = os.environ.get("FLASK_ENV") != "production"
    host  = "127.0.0.1" if debug else "0.0.0.0"
    app.run(debug=debug, host=host, port=5000)
