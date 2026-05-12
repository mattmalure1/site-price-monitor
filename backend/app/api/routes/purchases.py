from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_db
from app.models.purchase import Purchase
from app.schemas.purchase import PurchaseCreate, PurchaseSaleUpdate, PurchaseOut, BankrollStatus
from app.services.bankroll import check_bankroll, _sum_purchases, _count_open_auctions
from app.core.config import settings

router = APIRouter(prefix="/purchases", tags=["purchases"])


@router.get("/", response_model=list[PurchaseOut])
async def list_purchases(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Purchase).order_by(Purchase.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=PurchaseOut, status_code=201)
async def record_purchase(body: PurchaseCreate, db: AsyncSession = Depends(get_db)):
    proposed = body.purchase_price + body.shipping_paid
    approved, reasons = await check_bankroll(db, proposed)
    if not approved:
        raise HTTPException(status_code=422, detail={"bankroll_denied": reasons})

    purchase = Purchase(
        listing_id=body.listing_id,
        opportunity_id=body.opportunity_id,
        purchase_price=body.purchase_price,
        shipping_paid=body.shipping_paid,
        total_cost=proposed,
        won_at=datetime.now(timezone.utc),
        status="pending_receipt",
    )
    db.add(purchase)
    await db.commit()
    await db.refresh(purchase)
    return purchase


@router.patch("/{purchase_id}/received", response_model=PurchaseOut)
async def mark_received(purchase_id: int, db: AsyncSession = Depends(get_db)):
    purchase = await _get_purchase(db, purchase_id)
    purchase.received_at = datetime.now(timezone.utc)
    purchase.status = "in_inventory"
    await db.commit()
    await db.refresh(purchase)
    return purchase


@router.patch("/{purchase_id}/listed", response_model=PurchaseOut)
async def mark_listed(purchase_id: int, db: AsyncSession = Depends(get_db)):
    purchase = await _get_purchase(db, purchase_id)
    purchase.listed_at = datetime.now(timezone.utc)
    purchase.status = "listed"
    await db.commit()
    await db.refresh(purchase)
    return purchase


@router.patch("/{purchase_id}/sold", response_model=PurchaseOut)
async def record_sale(purchase_id: int, body: PurchaseSaleUpdate, db: AsyncSession = Depends(get_db)):
    purchase = await _get_purchase(db, purchase_id)
    purchase.sale_price = body.sale_price
    purchase.ebay_fees_paid = body.ebay_fees_paid
    purchase.sale_platform = body.sale_platform
    purchase.sold_at = body.sold_at or datetime.now(timezone.utc)
    purchase.net_profit = body.sale_price - purchase.total_cost - body.ebay_fees_paid
    if purchase.won_at and purchase.sold_at:
        purchase.days_to_sell = (purchase.sold_at - purchase.won_at).days
    purchase.status = "sold"
    await db.commit()
    await db.refresh(purchase)
    return purchase


@router.get("/bankroll", response_model=BankrollStatus)
async def bankroll_status(db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    daily_spent = await _sum_purchases(db, day_start)
    monthly_spent = await _sum_purchases(db, month_start)
    open_auctions = await _count_open_auctions(db)

    return BankrollStatus(
        daily_spent=daily_spent,
        daily_limit=settings.daily_max_spend,
        monthly_spent=monthly_spent,
        monthly_limit=settings.monthly_budget,
        open_auctions=open_auctions,
        max_open_auctions=settings.max_open_auctions,
        available_today=max(0, settings.daily_max_spend - daily_spent),
        available_month=max(0, settings.monthly_budget - monthly_spent),
    )


async def _get_purchase(db, purchase_id: int) -> Purchase:
    result = await db.execute(select(Purchase).where(Purchase.id == purchase_id))
    purchase = result.scalar_one_or_none()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return purchase
