#finn_scraper.py
import html
import re
import time
from typing import Dict, List

import requests
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "CommuteFinder/2.1"}

KOMMUNE_TO_CODE = {
    "oslo": "0.20061",
    "bergen": "1.20061.213",
    "trondheim": "1.20016.20225",
    "stavanger": "1.20011.2003",
    "fredrikstad": "1.20009.106",
}

LIST_RX  = re.compile(r"/realestate/lettings/ad\.html\?finnkode=")
PRICE_RX = re.compile(r"(\d[\d\s\u00A0]*kr)")
DIGITS   = re.compile(r"[^\d]")


def _parse(article) -> Dict:
    a = article.find("a", href=LIST_RX)
    if not a:
        return {}
    url   = "https://www.finn.no" + a["href"]
    title = html.unescape(a.get_text(" ", strip=True))

    keys = article.find("div",
                        class_=re.compile(r"(keys|sf-realestate-location)"))
    address = html.unescape(keys.get_text(" ", strip=True)) if keys else ""

    txt = article.get_text(" ", strip=True)
    m   = PRICE_RX.search(txt)
    price = int(DIGITS.sub("", m.group())) if m else None

    return {"title": title, "address": address, "price": price, "url": url}


def scrape_listings(location_code: str, price_max: int,
                    pages: int = 25) -> List[Dict]:
    base = "https://www.finn.no/realestate/lettings/search.html"
    rows: List[Dict] = []

    for pg in range(1, pages + 1):
        r = requests.get(base, params={"location": location_code,
                                       "price_to": price_max,
                                       "page": pg},
                         headers=HEADERS, timeout=15)
        if r.status_code != 200:
            break
        r.encoding = "utf-8"  # ensure æøå
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