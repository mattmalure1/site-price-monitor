"""
Bankroll guard: checks spending limits before approving a bid.
"""
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.models.purchase import Purchase


async def check_bankroll(
    db: AsyncSession,
    proposed_spend: float,
    card_name: str = "",
    set_name: str = "",
) -> tuple[bool, list[str]]:
    """Returns (approved, reasons_denied)."""
    reasons = []

    if proposed_spend > settings.max_single_card:
        reasons.append(f"Exceeds single-card limit: ${settings.max_single_card:.2f}")

    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    daily_spent = await _sum_purchases(db, day_start)
    if daily_spent + proposed_spend > settings.daily_max_spend:
        reasons.append(
            f"Would exceed daily limit: ${settings.daily_max_spend:.2f} "
            f"(spent ${daily_spent:.2f} today)"
        )

    monthly_spent = await _sum_purchases(db, month_start)
    if monthly_spent + proposed_spend > settings.monthly_budget:
        reasons.append(
            f"Would exceed monthly budget: ${settings.monthly_budget:.2f} "
            f"(spent ${monthly_spent:.2f} this month)"
        )

    open_auctions = await _count_open_auctions(db)
    if open_auctions >= settings.max_open_auctions:
        reasons.append(f"Max open auctions reached: {settings.max_open_auctions}")

    return len(reasons) == 0, reasons


async def _sum_purchases(db: AsyncSession, since: datetime) -> float:
    result = await db.execute(
        select(func.coalesce(func.sum(Purchase.total_cost), 0)).where(
            Purchase.won_at >= since
        )
    )
    return float(result.scalar())


async def _count_open_auctions(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count(Purchase.id)).where(
            Purchase.status == "pending_receipt"
        )
    )
    return int(result.scalar())
