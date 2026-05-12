"""
Match a parsed card against the local PriceCharting product cache.
Returns best match and a confidence score.
"""
from rapidfuzz import fuzz, process
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.pricing import PricechartingProduct
from app.services.title_parser import ParsedCard


async def find_best_match(
    db: AsyncSession,
    parsed: ParsedCard,
) -> tuple[PricechartingProduct | None, float]:
    """
    Returns (product, confidence) or (None, 0.0).
    confidence is 0.0–1.0.
    """
    if not parsed.card_name:
        return None, 0.0

    # Try exact card_number match first for high confidence
    if parsed.card_number:
        result = await db.execute(
            select(PricechartingProduct).where(
                PricechartingProduct.card_number == parsed.card_number
            )
        )
        number_matches = result.scalars().all()
        if number_matches:
            # Rank by name similarity among those
            best, score, _ = process.extractOne(
                parsed.card_name,
                {p.id: p.product_name for p in number_matches},
                scorer=fuzz.token_sort_ratio,
            )
            if score >= 70:
                product = next(p for p in number_matches if p.product_name == best)
                confidence = _calculate_confidence(parsed, product, score / 100)
                return product, confidence

    # Full-text fuzzy match on product_name
    result = await db.execute(select(PricechartingProduct))
    all_products = result.scalars().all()
    if not all_products:
        return None, 0.0

    choices = {p.id: p.product_name for p in all_products}
    best_name, score, best_id = process.extractOne(
        parsed.card_name,
        choices,
        scorer=fuzz.token_sort_ratio,
    )
    if score < 60:
        return None, 0.0

    product = next(p for p in all_products if p.id == best_id)
    confidence = _calculate_confidence(parsed, product, score / 100)
    return product, confidence


def _calculate_confidence(parsed: ParsedCard, product: PricechartingProduct, name_score: float) -> float:
    conf = name_score * 0.5

    # Card number match
    if parsed.card_number and product.card_number:
        if parsed.card_number == product.card_number:
            conf += 0.25
        else:
            conf -= 0.10

    # Set name match
    if parsed.set_name and product.set_name:
        set_score = fuzz.token_sort_ratio(parsed.set_name, product.set_name) / 100
        conf += set_score * 0.15

    # Sales volume — higher volume = more trustworthy price
    if product.sales_volume:
        if product.sales_volume > 50:
            conf += 0.10
        elif product.sales_volume > 20:
            conf += 0.05
        else:
            conf -= 0.05

    # Title parse confidence
    conf *= parsed.parse_confidence if parsed.parse_confidence > 0 else 0.7

    return max(0.0, min(1.0, conf))
