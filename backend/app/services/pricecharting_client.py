"""
PriceCharting API client with local caching.
Rate limit: 1 call/second. Use local DB cache; refresh daily.
"""
import httpx
from tenacity import retry, stop_after_attempt, wait_fixed
from app.core.config import settings
from app.core.logging import logger

PC_BASE_URL = "https://www.pricecharting.com/api"


class PricechartingClient:
    def __init__(self):
        self.api_key = settings.pricecharting_api_key

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(1))
    async def search_product(self, query: str) -> list[dict]:
        params = {"id": self.api_key, "q": query}
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{PC_BASE_URL}/products", params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        return [self._normalize(p) for p in data.get("products", [])]

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(1))
    async def get_product(self, product_id: str) -> dict:
        params = {"id": self.api_key, "product": product_id}
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{PC_BASE_URL}/product", params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        return self._normalize(data)

    def _normalize(self, raw: dict) -> dict:
        def price(key: str) -> float | None:
            val = raw.get(key)
            if val is None:
                return None
            try:
                cents = int(val)
                return round(cents / 100, 2)
            except (ValueError, TypeError):
                return None

        return {
            "pricecharting_id": str(raw.get("id", "")),
            "product_name": raw.get("product-name", ""),
            "console_name": raw.get("console-name", ""),
            "set_name": raw.get("console-name", ""),  # PC uses console-name for set
            "card_number": raw.get("number", ""),
            "loose_price": price("loose-price"),
            "grade_7_price": price("grade-7-price"),
            "grade_8_price": price("grade-8-price"),
            "grade_9_price": price("grade-9-price"),
            "psa_10_price": price("graded-price"),  # PC "graded-price" = PSA 10
            "cgc_10_price": price("cgc-10-grade-price"),
            "bgs_10_price": price("bgs-10-grade-price"),
            "sgc_10_price": price("sgc-10-grade-price"),
            "sales_volume": raw.get("sales-volume"),
        }
