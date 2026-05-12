"""
Hard-pass risk filters applied before any scoring.
Returns (passes: bool, reasons: list[str]).
"""
import re
from app.models.listing import EbayListing, ParsedCard

BLOCKED_TITLE_PHRASES = [
    "custom card", "proxy", "metal card", "gold card", "fan art",
    "reprint", "not psa", "not cgc", "not graded", "digital",
    "read description", "damaged slab", "cracked case", "cracked slab",
    "broken case", "not authentic", "replica",
]

BLOCKED_GRADERS = {"", "unknown"}
ALLOWED_GRADERS = {"PSA", "CGC", "BGS", "SGC"}

MIN_SELLER_FEEDBACK_SCORE = 20
MIN_SELLER_FEEDBACK_PERCENT = 90.0
MAX_SHIPPING = 30.0
MIN_MARKET_VALUE = 25.0


def passes_risk_filters(
    listing: EbayListing,
    parsed: ParsedCard,
) -> tuple[bool, list[str]]:
    reasons = []

    title_lower = listing.title.lower()
    for phrase in BLOCKED_TITLE_PHRASES:
        if phrase in title_lower:
            reasons.append(f"Blocked phrase in title: '{phrase}'")

    if parsed.grader not in ALLOWED_GRADERS:
        reasons.append(f"Unrecognized grader: '{parsed.grader}'")

    if parsed.grade is None:
        reasons.append("No grade detected")

    if listing.seller_feedback_score < MIN_SELLER_FEEDBACK_SCORE:
        reasons.append(f"Low seller feedback score: {listing.seller_feedback_score}")

    if listing.seller_feedback_percent < MIN_SELLER_FEEDBACK_PERCENT:
        reasons.append(f"Low seller feedback %: {listing.seller_feedback_percent}%")

    if listing.shipping_price > MAX_SHIPPING:
        reasons.append(f"Shipping too high: ${listing.shipping_price:.2f}")

    # Flag any existing risk flags from parser
    reasons.extend(parsed.risk_flags)

    passes = len(reasons) == 0
    return passes, reasons
