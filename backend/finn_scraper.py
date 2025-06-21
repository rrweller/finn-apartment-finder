#finn_scraper.py
import html
import re
import time
from typing import Dict, List, Sequence, Tuple
from finn_maps import TYPE_MAP, FACILITY_MAP, FLOOR_MAP
from urllib.parse import urlencode

import requests
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "CommuteFinder/3.0"}

LIST_RX   = re.compile(r"/realestate/lettings/ad\.html\?finnkode=")
PRICE_RX  = re.compile(r"(\d[\d\s\u00A0]*kr)")
SIZE_RX   = re.compile(r"(\d+)\s*m²")
DIGITS    = re.compile(r"[^\d]")

# ─── helpers ────────────────────────────────────────────────────────────────
def _parse(article) -> Dict:
    a = article.find("a", href=LIST_RX)
    if not a:
        return {}
    url   = "https://www.finn.no" + a["href"]
    title = html.unescape(a.get_text(" ", strip=True))

    # address
    keys = article.find("div", class_=re.compile(r"(keys|sf-realestate-location)"))
    address = html.unescape(keys.get_text(" ", strip=True)) if keys else ""

    text = article.get_text(" ", strip=True)

    # price
    m = PRICE_RX.search(text)
    price = int(DIGITS.sub("", m.group())) if m else None

    # size
    s = None
    ms = SIZE_RX.search(text)
    if ms:
        s = int(ms.group(1))

    # boligtype
    typ = None
    desc = article.find("div", class_=re.compile(r"text-xs s-text-subtle"))
    if desc:
        dt  = desc.get_text(" ", strip=True)
        typ = dt.split("∙")[0].strip()

    # thumbnail
    img   = article.find("img", src=True)
    thumb = img["src"] if img else None

    return {
        "title":   title,
        "address": address,
        "price":   price,
        "size":    s,
        "type":    typ,
        "url":     url,
        "thumb":   thumb,
    }

# ─── public scraper using geoPolygon ────────────────────────────────────────
def scrape_listings_polygon(
        polylocation: str,
        price_min: int | None,
        price_max: int,
        *,
        pages: int = 50,
        property_types: Sequence[str] = (),
        facilities:     Sequence[str] = (),
        floors:         Sequence[str] = (),
        area_from: int | None = None,
        area_to:   int | None = None,
        bedrooms_min: int | None = None,
    ):
    """Fetch FINN result pages for one polygon + filter set."""
    base = "https://www.finn.no/realestate/lettings/search.html"

    params: list[tuple[str, str]] = [
        ("polylocation", polylocation),
        ("price_to",     str(price_max)),
    ]
    if price_min:
        params.append(("price_from", str(price_min)))
    if bedrooms_min:
        params.append(("min_bedrooms", str(bedrooms_min)))

    for t in property_types:
        if t in TYPE_MAP:
            params.append(("property_type", TYPE_MAP[t]))
    for f in facilities:
        if f in FACILITY_MAP:
            params.append(("facilities", FACILITY_MAP[f]))
    for fl in floors:
        if fl in FLOOR_MAP:
            params.append(("floor_navigator", FLOOR_MAP[fl]))
    if area_from is not None:
        params.append(("area_from", str(area_from)))
    if area_to is not None:
        params.append(("area_to", str(area_to)))

    print("[Finn URL]", f"{base}?{urlencode(params, doseq=True)}")

    rows: list[dict] = []
    for pg in range(1, pages + 1):
        page_params = params + [("page", str(pg))]
        r = requests.get(base, params=page_params, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            break
        soup = BeautifulSoup(r.text, "html.parser")
        arts = soup.find_all("article")
        if not arts:
            break
        for art in arts:
            d = _parse(art)
            if d:
                rows.append(d)
        time.sleep(0.5)

    print(f"[Finn] harvested {len(rows)} rows")
    return rows

