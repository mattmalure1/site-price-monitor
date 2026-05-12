"""
eBay Browse API client for searching listings.
Uses the official eBay Browse API (no login automation).
"""
import httpx
from datetime import datetime, timezone
from typing import Optional
from tenacity import retry, stop_after_attempt, wait_exponential
from app.core.config import settings
from app.core.logging import logger

EBAY_BASE_URL = "https://api.ebay.com"
EBAY_SANDBOX_URL = "https://api.sandbox.ebay.com"

# Searches run in cycles — these are the MVP Phase 1 query set
GRADED_POKEMON_QUERIES = [
    "PSA 10 Pokemon",
    "PSA 9 Pokemon",
    "CGC 10 Pokemon",
    "BGS 9.5 Pokemon",
    "BGS 10 Pokemon",
    "PSA 10 Charizard",
    "PSA 10 Pikachu",
    "PSA 10 Umbreon",
    "PSA 10 Espeon",
    "PSA 10 Rayquaza",
    "PSA 10 Lugia",
    "PSA 10 Mew",
    "PSA 10 Mewtwo",
    "PSA 10 Gengar",
    "PSA 10 Blastoise",
    "PSA 10 Eevee",
    "PSA 10 Dragonite",
    "PSA 10 Greninja",
    # Misspellings that reduce competition
    "Pokeman PSA 10",
    "Poke mon PSA 10",
    "Charzard PSA",
    "Umbrion PSA",
    "PSA 10 Pokemon japanese",
]

# eBay category for trading cards
TRADING_CARDS_CATEGORY = "183454"


class EbayClient:
    def __init__(self):
        base = EBAY_SANDBOX_URL if settings.ebay_environment == "sandbox" else EBAY_BASE_URL
        self.base_url = base
        self._token: Optional[str] = None
        self._token_expires: Optional[datetime] = None

    async def _get_token(self) -> str:
        if self._token and self._token_expires and datetime.now(timezone.utc) < self._token_expires:
            return self._token
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/identity/v1/oauth2/token",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "grant_type": "client_credentials",
                    "scope": "https://api.ebay.com/oauth/api_scope",
                },
                auth=(settings.ebay_app_id, settings.ebay_cert_id),
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            self._token = data["access_token"]
            expires_in = data.get("expires_in", 7200)
            from datetime import timedelta
            self._token_expires = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)
        return self._token

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def search_listings(
        self,
        query: str,
        listing_type: str = "AUCTION",
        ending_within_minutes: Optional[int] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        token = await self._get_token()
        filters = [f"buyingOptions:{{{listing_type}}}"]
        if ending_within_minutes:
            filters.append(f"itemEndDate:[..+{ending_within_minutes}m]")

        params = {
            "q": query,
            "category_ids": TRADING_CARDS_CATEGORY,
            "filter": ",".join(filters),
            "limit": limit,
            "offset": offset,
            "fieldgroups": "EXTENDED",
        }
        headers = {
            "Authorization": f"Bearer {token}",
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/buy/browse/v1/item_summary/search",
                headers=headers,
                params=params,
                timeout=20,
            )
            if resp.status_code == 429:
                raise httpx.HTTPStatusError("Rate limited", request=resp.request, response=resp)
            resp.raise_for_status()
            data = resp.json()

        items = data.get("itemSummaries", [])
        return [self._normalize_item(item) for item in items]

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def get_item(self, item_id: str) -> dict:
        token = await self._get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        }
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/buy/browse/v1/item/{item_id}",
                headers=headers,
                timeout=20,
            )
            resp.raise_for_status()
        return self._normalize_item(resp.json(), detailed=True)

    def _normalize_item(self, raw: dict, detailed: bool = False) -> dict:
        price = raw.get("price", {})
        shipping_options = raw.get("shippingOptions", [{}])
        shipping = shipping_options[0].get("shippingCost", {}) if shipping_options else {}
        seller = raw.get("seller", {})
        seller_feedback = seller.get("feedbackScore", 0)
        seller_pct = seller.get("feedbackPercentage", "0")

        current_price = float(price.get("value", 0))
        shipping_price = float(shipping.get("value", 0))
        buying_options = raw.get("buyingOptions", [])
        listing_type = "AUCTION" if "AUCTION" in buying_options else "BIN"
        if "BEST_OFFER" in buying_options:
            listing_type = "BEST_OFFER"

        end_time = raw.get("itemEndDate") or raw.get("endTime")

        images = []
        if "image" in raw:
            images.append(raw["image"].get("imageUrl", ""))
        for img in raw.get("additionalImages", []):
            images.append(img.get("imageUrl", ""))

        return {
            "ebay_item_id": raw.get("itemId", ""),
            "title": raw.get("title", ""),
            "url": raw.get("itemWebUrl", ""),
            "listing_type": listing_type,
            "current_price": current_price,
            "shipping_price": shipping_price,
            "total_price": current_price + shipping_price,
            "bid_count": raw.get("bidCount", 0),
            "end_time": end_time,
            "seller_username": seller.get("username", ""),
            "seller_feedback_score": seller_feedback,
            "seller_feedback_percent": float(seller_pct),
            "condition": raw.get("condition", ""),
            "image_urls": [u for u in images if u],
            "has_authenticity_guarantee": raw.get("authenticityGuarantee", {}).get("status") == "AVAILABLE",
            "return_policy": raw.get("returnTerms", {}).get("returnsAccepted", ""),
        }
