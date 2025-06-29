"""
Helpers for turning Shapely polygons into FINN URL params.
"""
from __future__ import annotations
from shapely.geometry import Polygon, MultiPolygon
from typing import Protocol

# keep import-footprint tiny – these helpers are called a lot
def build_polylocation_param(geom: "Polygon | MultiPolygon",
                             max_vertices: int = 30) -> str:
    """
    Return the `"lon lat,lon lat, …"` string FINN accepts for a map polygon.
    The polygon is simplified & down-sampled to keep URLs short but precise.
    """
    if geom.is_empty:
        raise ValueError("Empty geometry passed to build_polylocation_param")

    if isinstance(geom, MultiPolygon):
        geom = geom.convex_hull                         # one ring only
    poly: Polygon = geom.simplify(0.0003)
    step          = max(1, len(poly.exterior.coords) // max_vertices)
    pts           = list(poly.exterior.coords)[::step]
    if pts[-1] != pts[0]:
        pts.append(pts[0])                              # close ring
    return ",".join(f"{lon:.5f} {lat:.5f}" for lon, lat in pts)
