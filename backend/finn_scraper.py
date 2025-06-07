"""
Finn.no 'Bolig til leie' scraper – v1.3
Works with both the legacy ads__unit markup and the new sf-search-ad markup.
"""
import re
import time
from typing import Dict, List

import requests
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "CommuteFinder/1.3"}

KOMMUNE_TO_CODE = {
    "oslo": "0.20061",
    "bergen": "1.20061.213",
    "trondheim": "1.20016.20225",
    "stavanger": "1.20011.2003",
    "fredrikstad": "1.20009.106",
}

PRICE_RX = re.compile(r"(\d[\d\s\u00A0]*kr)")
DIGITS_ONLY = re.compile(r"[^\d]")


def _parse_listing(article) -> Dict:
    """Return {title, address, price, url} or {} on failure."""
    link = article.find("a", href=re.compile(r"/realestate/lettings/ad\.html"))
    if not link:
        return {}
    url = "https://www.finn.no" + link["href"]
    title = link.get_text(strip=True)

    # v1 design: ads__unit__content__keys
    addr = price = None
    keys_div = article.find(
        "div", class_=re.compile(r"(ads__unit__content__keys|sf-realestate-location)")
    )
    if keys_div:
        txt = keys_div.get_text(" ", strip=True)
        # split on '∙' or commas → first chunk is usually street
        addr = txt.split("∙")[0].split(",")[0].strip()

    # Fallback: brute-force search in all text
    whole = article.get_text(" ", strip=True)
    if not addr:
        if keys_div:
            txt_block = txt                       # we still have txt from keys_div
        else:
            txt_block = whole
        addr_parts = [p.strip() for p in txt_block.split(",")]
        addr = ", ".join(addr_parts[:2])
    m = PRICE_RX.search(whole)
    if m:
        price = int(DIGITS_ONLY.sub("", m.group()))

    return {"title": title, "address": addr, "price": price, "url": url}


def scrape_listings(location_code: str, max_rent: int, max_pages: int = 25) -> List[Dict]:
    """Scrape Finn results, return list of dicts (may be empty)."""
    base = "https://www.finn.no/realestate/lettings/search.html"
    listings: List[Dict] = []

    for page in range(1, max_pages + 1):
        params = {"location": location_code, "price_to": max_rent, "page": page}
        r = requests.get(base, params=params, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            print(f"[Finn] HTTP {r.status_code} – stopping scraping.")
            break
        soup = BeautifulSoup(r.text, "html.parser")
        arts = soup.find_all("article")
        if not arts:
            break
        for a in arts:
            lst = _parse_listing(a)
            if lst:
                listings.append(lst)
        time.sleep(0.7)  # polite
    print(f"[Finn] scraped {len(listings)} raw listings for code={location_code}")
    return listings
