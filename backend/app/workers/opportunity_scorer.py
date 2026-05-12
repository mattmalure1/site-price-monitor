"""
Opportunity scorer worker.
Runs on all pending listings, applies risk filters, scores, and alerts.
"""
import asyncio
from datetime import datetime, timezone
from celery import shared_task
from sqlalchemy import select
from app.workers.celery_app import celery_app
from app.db.database import AsyncSessionLocal
from app.models.listing import EbayListing, ParsedCard
from app.models.opportunity import Opportunity
from app.services.product_matcher import find_best_match
from app.services.risk_filter import passes_risk_filters
from app.services.scorer import score_opportunity
from app.services.alert_service import send_opportunity_alert
from app.core.config import settings
from app.core.logging import logger


@celery_app.task(name="app.workers.opportunity_scorer.rescore_pending")
def rescore_pending():
    asyncio.run(_rescore())


async def _rescore():
    async with AsyncSessionLocal() as db:
        # Fetch listings that have a parsed card but no opportunity yet,
        # or opportunities that are still "pending" with updated prices
        result = await db.execute(
            select(EbayListing, ParsedCard)
            .join(ParsedCard, ParsedCard.listing_id == EbayListing.id)
            .outerjoin(Opportunity, Opportunity.listing_id == EbayListing.id)
            .where(
                EbayListing.is_active == True,
                ParsedCard.grader.in_(["PSA", "CGC", "BGS", "SGC"]),
            )
        )
        rows = result.all()

    scored = 0
    alerted = 0
    for listing, parsed in rows:
        try:
            passes, reasons = passes_risk_filters(listing, parsed)
            if not passes:
                await _save_opportunity(db, listing, parsed, None, 0, "PASS", "pass", reasons)
                continue

            product, confidence = await find_best_match(db, parsed)
            opp = score_opportunity(listing, parsed, product, confidence)

            status = "pending" if opp.signal in ("GREEN", "YELLOW") else "pass"
            notes = ""
            if not opp.viable:
                notes = "Math does not work at current price"

            saved_opp = await _save_opportunity(
                db, listing, parsed, product, opp, opp.signal, status, []
            )
            await db.commit()
            scored += 1

            if opp.signal == "GREEN" and saved_opp and not saved_opp.alerted_at:
                minutes_left = None
                if listing.end_time:
                    end = listing.end_time if listing.end_time.tzinfo else listing.end_time.replace(tzinfo=timezone.utc)
                    minutes_left = int((end - datetime.now(timezone.utc)).total_seconds() / 60)
                await send_opportunity_alert(
                    card_name=f"{parsed.card_name} {parsed.variant}".strip(),
                    grader=parsed.grader,
                    grade=parsed.grade or 0,
                    market_value=opp.market_value,
                    current_total=listing.total_price,
                    max_bid=opp.max_bid,
                    expected_profit=opp.expected_profit,
                    roi=opp.roi,
                    score=opp.total_score,
                    listing_url=listing.url,
                    minutes_left=minutes_left,
                )
                saved_opp.alerted_at = datetime.now(timezone.utc)
                await db.commit()
                alerted += 1

        except Exception as e:
            logger.error("score_error", listing_id=listing.id, error=str(e))

    logger.info("rescore_done", scored=scored, alerted=alerted)


async def _save_opportunity(db, listing, parsed, product, opp, signal, status, reasons):
    from sqlalchemy import select as sel
    result = await db.execute(
        sel(Opportunity).where(Opportunity.listing_id == listing.id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        opp_obj = existing
    else:
        opp_obj = Opportunity(listing_id=listing.id)
        db.add(opp_obj)

    if product:
        opp_obj.matched_product_id = product.id

    if hasattr(opp, "market_value"):
        opp_obj.market_value = opp.market_value
        opp_obj.resale_value = opp.resale_value
        opp_obj.fee_estimate = opp.fee_estimate
        opp_obj.shipping_out = opp.shipping_out
        opp_obj.supplies = opp.supplies
        opp_obj.risk_buffer = opp.risk_buffer
        opp_obj.target_profit = opp.target_profit
        opp_obj.max_bid = opp.max_bid
        opp_obj.expected_profit = opp.expected_profit
        opp_obj.roi = opp.roi
        opp_obj.profit_score = opp.profit_score
        opp_obj.roi_score = opp.roi_score
        opp_obj.confidence_score = opp.confidence_score
        opp_obj.liquidity_score = opp.liquidity_score
        opp_obj.seller_score = opp.seller_score
        opp_obj.timing_score = opp.timing_score
        opp_obj.total_score = opp.total_score

    opp_obj.signal = signal
    opp_obj.status = status
    if reasons:
        opp_obj.notes = "; ".join(reasons)
    opp_obj.updated_at = datetime.now(timezone.utc)

    await db.flush()
    return opp_obj
