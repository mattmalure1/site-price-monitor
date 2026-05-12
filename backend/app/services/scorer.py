"""
Opportunity scorer and max-bid calculator.

Scoring breakdown (0–100):
  Profit score:     0–30
  ROI score:        0–20
  Confidence score: 0–20
  Liquidity score:  0–10
  Seller score:     0–10
  Timing score:     0–10
"""
from datetime import datetime, timezone
from typing import Optional
from app.core.config import settings
from app.models.listing import EbayListing, ParsedCard
from app.models.pricing import PricechartingProduct

HIGH_LIQUIDITY_POKEMON = {
    "charizard", "pikachu", "umbreon", "espeon", "rayquaza", "lugia", "mew",
    "mewtwo", "gengar", "blastoise", "venusaur", "eevee", "dragonite", "greninja",
}


class OpportunityResult:
    def __init__(self):
        self.market_value = 0.0
        self.resale_value = 0.0
        self.fee_estimate = 0.0
        self.shipping_out = settings.default_shipping_out
        self.supplies = settings.default_supplies
        self.risk_buffer = 0.0
        self.target_profit = 0.0
        self.max_bid = 0.0
        self.expected_profit = 0.0
        self.roi = 0.0
        self.profit_score = 0.0
        self.roi_score = 0.0
        self.confidence_score = 0.0
        self.liquidity_score = 0.0
        self.seller_score = 0.0
        self.timing_score = 0.0
        self.total_score = 0.0
        self.signal = "PASS"  # GREEN / YELLOW / RED / PASS
        self.viable = False


def score_opportunity(
    listing: EbayListing,
    parsed: ParsedCard,
    product: Optional[PricechartingProduct],
    match_confidence: float,
) -> OpportunityResult:
    result = OpportunityResult()

    if product is None or match_confidence < settings.min_match_confidence:
        result.signal = "PASS"
        return result

    # --- Market value ---
    market_value = product.price_for_grade(parsed.grader, parsed.grade or 0)
    if not market_value or market_value <= 0:
        result.signal = "PASS"
        return result

    result.market_value = market_value

    # --- Liquidity haircut ---
    liquidity_adj = _liquidity_adjustment(product, parsed)

    # --- Confidence haircut ---
    conf_adj = 0.80 + (match_confidence * 0.20)  # 80–100% of market value

    result.resale_value = market_value * liquidity_adj * conf_adj

    # --- Cost model ---
    result.fee_estimate = result.resale_value * settings.ebay_final_value_fee_rate + settings.ebay_per_order_fee
    result.risk_buffer = result.resale_value * _risk_buffer_rate(parsed, listing)
    result.target_profit = max(settings.min_expected_profit, result.resale_value * 0.20)

    result.max_bid = (
        result.resale_value
        - result.fee_estimate
        - result.shipping_out
        - result.supplies
        - result.risk_buffer
        - result.target_profit
        - listing.shipping_price  # inbound shipping
    )

    if result.max_bid <= 0:
        result.signal = "PASS"
        return result

    total_current = listing.total_price
    result.expected_profit = result.resale_value - total_current - result.fee_estimate - result.shipping_out - result.supplies - result.risk_buffer

    if result.expected_profit < settings.min_expected_profit:
        result.signal = "PASS"
        return result

    cost_basis = total_current + result.fee_estimate + result.shipping_out + result.supplies
    result.roi = (result.expected_profit / cost_basis * 100) if cost_basis > 0 else 0

    if result.roi < settings.min_roi_percent:
        result.signal = "PASS"
        return result

    result.viable = True

    # --- Scoring ---
    result.profit_score = _profit_score(result.expected_profit)
    result.roi_score = _roi_score(result.roi)
    result.confidence_score = match_confidence * 20
    result.liquidity_score = _liquidity_score(product, parsed)
    result.seller_score = _seller_score(listing)
    result.timing_score = _timing_score(listing)

    result.total_score = (
        result.profit_score
        + result.roi_score
        + result.confidence_score
        + result.liquidity_score
        + result.seller_score
        + result.timing_score
    )

    if result.total_score >= settings.urgent_alert_score:
        result.signal = "GREEN"
    elif result.total_score >= settings.review_score:
        result.signal = "YELLOW"
    else:
        result.signal = "RED"

    return result


def _liquidity_adjustment(product: PricechartingProduct, parsed: ParsedCard) -> float:
    base = 0.90
    name_lower = parsed.card_name.lower()
    if any(p in name_lower for p in HIGH_LIQUIDITY_POKEMON):
        base = 0.95
    if product.sales_volume:
        if product.sales_volume > 100:
            base = min(1.0, base + 0.05)
        elif product.sales_volume < 10:
            base = max(0.70, base - 0.15)
        elif product.sales_volume < 25:
            base = max(0.75, base - 0.10)
    return base


def _risk_buffer_rate(parsed: ParsedCard, listing: EbayListing) -> float:
    rate = 0.07
    if parsed.risk_flags:
        rate += 0.05 * len(parsed.risk_flags)
    if listing.seller_feedback_percent < 98:
        rate += 0.03
    if listing.seller_feedback_score < 100:
        rate += 0.03
    if not listing.return_policy:
        rate += 0.02
    return min(0.20, rate)


def _profit_score(profit: float) -> float:
    if profit >= 100:
        return 30.0
    if profit >= 50:
        return 25.0
    if profit >= 30:
        return 20.0
    if profit >= 20:
        return 15.0
    if profit >= 15:
        return 10.0
    return 5.0


def _roi_score(roi: float) -> float:
    if roi >= 60:
        return 20.0
    if roi >= 40:
        return 16.0
    if roi >= 30:
        return 12.0
    if roi >= 25:
        return 8.0
    return 4.0


def _liquidity_score(product: PricechartingProduct, parsed: ParsedCard) -> float:
    score = 5.0
    name_lower = parsed.card_name.lower()
    if any(p in name_lower for p in HIGH_LIQUIDITY_POKEMON):
        score += 3.0
    if product.sales_volume:
        if product.sales_volume > 100:
            score += 2.0
        elif product.sales_volume > 50:
            score += 1.0
    return min(10.0, score)


def _seller_score(listing: EbayListing) -> float:
    score = 0.0
    pct = listing.seller_feedback_percent
    if pct >= 99.5:
        score = 10.0
    elif pct >= 99.0:
        score = 8.0
    elif pct >= 98.0:
        score = 6.0
    elif pct >= 95.0:
        score = 3.0
    else:
        score = 1.0

    if listing.seller_feedback_score < 50:
        score = max(0, score - 3)
    if listing.has_authenticity_guarantee:
        score = min(10, score + 1)
    if listing.return_policy:
        score = min(10, score + 1)
    return score


def _timing_score(listing: EbayListing) -> float:
    """Higher score for auction timing advantages (ending soon, odd hours)."""
    if listing.listing_type == "BIN":
        return 5.0  # BIN doesn't need timing
    if not listing.end_time:
        return 3.0
    now = datetime.now(timezone.utc)
    end = listing.end_time if listing.end_time.tzinfo else listing.end_time.replace(tzinfo=timezone.utc)
    minutes_left = (end - now).total_seconds() / 60
    if minutes_left < 5:
        return 10.0
    if minutes_left < 15:
        return 8.0
    if minutes_left < 60:
        return 6.0
    return 3.0
