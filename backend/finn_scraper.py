"""
Very small Finn.no scraper for 'Bolig til leie'.
• Uses location taxonomy codes in the query-string.
• Extracts title, address, price and link from the search result pages.
This is deliberately lightweight and single-threaded to stay polite.
"""
import re
import time
from typing import List, Dict

import requests
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; CommuteMap/1.0)"}


# --- Static mapping for common kommuner. Add more as you need -------------
KOMMUNE_TO_CODE = {
    # county Oslo (code 0.20061) is both county+kommune
    "oslo": "0.20061",
    "bergen": "1.20061.213",
    "trondheim": "1.20016.20225",
    "stavanger": "1.20011.2003",
    "fredrikstad": "1.20009.106",
}
# --------------------------------------------------------------------------


PRICE_CLEAN = re.compile(r"[^\d]")


def _parse_listing(article) -> Dict:
    """
    Extract data from <article> node in search results.
    """
    link_tag = article.find("a", href=re.compile(r"/realestate/lettings/ad\.html\?finnkode=\d+"))
    if not link_tag:
        return {}
    url = "https://www.finn.no" + link_tag["href"]
    title = link_tag.get_text(strip=True)

    # The address and price usually live in div.ads__unit__content__keys
    keys_div = article.find("div", class_=re.compile(r"ads__unit__content__keys"))
    address, price = "", None
    if keys_div:
        text = keys_div.get_text(separator="|", strip=True)
        parts = text.split("|")
        if parts:
            address = parts[0]
        # Find something that looks like '11 500 kr'
        price_match = re.search(r"\d[\d\s\u00A0]*kr", text)
        if price_match:
            price_digits = PRICE_CLEAN.sub("", price_match.group())
            price = int(price_digits) if price_digits else None

    return {"title": title, "address": address, "price": price, "url": url}


def scrape_listings(kommune_code: str, max_rent: int, max_pages: int = 30) -> List[Dict]:
    """
    Iterate Finn search result pages and collect listings.
    """
    base_url = "https://www.finn.no/realestate/lettings/search.html"
    listings = []

    for page in range(1, max_pages + 1):
        params = {"location": kommune_code, "price_to": max_rent, "page": page}
        resp = requests.get(base_url, params=params, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            break
        soup = BeautifulSoup(resp.text, "html.parser")
        articles = soup.find_all("article", class_=re.compile(r"ads__unit|sf-search-ad"))
        if not articles:
            break

        for art in articles:
            lst = _parse_listing(art)
            if lst:
                listings.append(lst)

        # polite pause so we don't hammer Finn's servers
        time.sleep(1)
    return listings