"""
eBay scanner worker.
Searches for graded Pokémon auctions and BIN listings,
saves new listings, parses titles, and queues scoring.
"""
import asyncio
from datetime import datetime, timezone
from celery import shared_task
from sqlalchemy import select
from app.workers.celery_app import celery_app
from app.db.database import AsyncSessionLocal
from app.models.listing import EbayListing, ParsedCard
from app.services.ebay_client import EbayClient, GRADED_POKEMON_QUERIES
from app.services.title_parser import parse_title
from app.core.logging import logger


@celery_app.task(name="app.workers.ebay_scanner.scan_auctions")
def scan_auctions():
    asyncio.run(_scan(listing_type="AUCTION", ending_within_minutes=60))


@celery_app.task(name="app.workers.ebay_scanner.scan_bin")
def scan_bin():
    asyncio.run(_scan(listing_type="FIXED_PRICE"))


async def _scan(listing_type: str, ending_within_minutes: int | None = None):
    client = EbayClient()
    async with AsyncSessionLocal() as db:
        for query in GRADED_POKEMON_QUERIES:
            try:
                items = await client.search_listings(
                    query=query,
                    listing_type=listing_type,
                    ending_within_minutes=ending_within_minutes,
                    limit=50,
                )
                for item_data in items:
                    await _upsert_listing(db, item_data)
                await asyncio.sleep(0.5)  # be polite to eBay API
            except Exception as e:
                logger.error("ebay_scan_error", query=query, error=str(e))

        await db.commit()
    logger.info("ebay_scan_done", listing_type=listing_type, queries=len(GRADED_POKEMON_QUERIES))


async def _upsert_listing(db, item_data: dict):
    ebay_id = item_data["ebay_item_id"]
    result = await db.execute(
        select(EbayListing).where(EbayListing.ebay_item_id == ebay_id)
    )
    listing = result.scalar_one_or_none()

    if listing:
        # Update price/bid data
        listing.current_price = item_data["current_price"]
        listing.shipping_price = item_data["shipping_price"]
        listing.total_price = item_data["total_price"]
        listing.bid_count = item_data["bid_count"]
        listing.last_seen_at = datetime.now(timezone.utc)
    else:
        listing = EbayListing(**item_data)
        db.add(listing)
        await db.flush()

        # Parse title for new listings
        parsed = parse_title(listing.title)
        card = ParsedCard(
            listing_id=listing.id,
            game=parsed.game,
            card_name=parsed.card_name,
            set_name=parsed.set_name,
            card_number=parsed.card_number,
            language=parsed.language,
            grader=parsed.grader,
            grade=parsed.grade,
            cert_number=parsed.cert_number,
            variant=parsed.variant,
            parse_confidence=parsed.parse_confidence,
            risk_flags=parsed.risk_flags,
            image_flags=parsed.image_flags,
        )
        db.add(card)
        logger.info("new_listing", ebay_id=ebay_id, title=listing.title[:60])
