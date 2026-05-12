"""
PriceCharting sync worker.
Searches for each distinct parsed card name and updates local price cache.
Respects 1 req/sec rate limit.
"""
import asyncio
from datetime import datetime, timezone
from celery import shared_task
from sqlalchemy import select, update
from app.workers.celery_app import celery_app
from app.db.database import AsyncSessionLocal
from app.models.listing import ParsedCard
from app.models.pricing import PricechartingProduct
from app.services.pricecharting_client import PricechartingClient
from app.core.logging import logger


@celery_app.task(name="app.workers.pc_sync.sync_all_prices")
def sync_all_prices():
    asyncio.run(_sync())


async def _sync():
    client = PricechartingClient()
    async with AsyncSessionLocal() as db:
        # Get distinct card names from parsed_cards
        result = await db.execute(
            select(ParsedCard.card_name).distinct().where(ParsedCard.card_name != "")
        )
        card_names = [row[0] for row in result.all()]

    logger.info("pc_sync_start", card_count=len(card_names))

    for card_name in card_names:
        try:
            products = await client.search_product(f"{card_name} Pokemon")
            async with AsyncSessionLocal() as db:
                for p_data in products:
                    await _upsert_product(db, p_data)
                await db.commit()
            await asyncio.sleep(1.1)  # respect rate limit
        except Exception as e:
            logger.error("pc_sync_error", card_name=card_name, error=str(e))

    logger.info("pc_sync_done")


async def _upsert_product(db, data: dict):
    pc_id = data["pricecharting_id"]
    result = await db.execute(
        select(PricechartingProduct).where(PricechartingProduct.pricecharting_id == pc_id)
    )
    product = result.scalar_one_or_none()

    if product:
        for field, val in data.items():
            if val is not None:
                setattr(product, field, val)
        product.updated_at = datetime.now(timezone.utc)
    else:
        product = PricechartingProduct(**data, updated_at=datetime.now(timezone.utc))
        db.add(product)
