from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_db
from app.models.opportunity import Opportunity
from app.models.listing import EbayListing, ParsedCard
from app.schemas.opportunity import OpportunityOut, OpportunityStatusUpdate

router = APIRouter(prefix="/opportunities", tags=["opportunities"])


@router.get("/", response_model=list[OpportunityOut])
async def list_opportunities(
    signal: str | None = Query(None, description="GREEN / YELLOW / RED / PASS"),
    status: str | None = Query(None),
    min_score: float = Query(0, ge=0, le=100),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Opportunity)
        .options(
            selectinload(Opportunity.listing).selectinload(EbayListing.parsed_card)
        )
        .where(Opportunity.total_score >= min_score)
        .order_by(desc(Opportunity.total_score))
        .limit(limit)
        .offset(offset)
    )
    if signal:
        q = q.where(Opportunity.signal == signal.upper())
    if status:
        q = q.where(Opportunity.status == status)

    result = await db.execute(q)
    return result.scalars().all()


@router.get("/best", response_model=list[OpportunityOut])
async def best_opportunities(
    limit: int = Query(20, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Top active opportunities sorted by score — main dashboard feed."""
    q = (
        select(Opportunity)
        .options(
            selectinload(Opportunity.listing).selectinload(EbayListing.parsed_card)
        )
        .where(
            Opportunity.signal.in_(["GREEN", "YELLOW"]),
            Opportunity.status.in_(["pending", "watched"]),
            Opportunity.listing.has(EbayListing.is_active == True),
        )
        .order_by(desc(Opportunity.total_score))
        .limit(limit)
    )
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{opportunity_id}", response_model=OpportunityOut)
async def get_opportunity(opportunity_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Opportunity)
        .options(
            selectinload(Opportunity.listing).selectinload(EbayListing.parsed_card),
            selectinload(Opportunity.matched_product),
        )
        .where(Opportunity.id == opportunity_id)
    )
    opp = result.scalar_one_or_none()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    return opp


@router.patch("/{opportunity_id}/status", response_model=OpportunityOut)
async def update_status(
    opportunity_id: int,
    body: OpportunityStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    allowed_statuses = {"watched", "passed", "won", "lost", "manual_review", "pending"}
    if body.status not in allowed_statuses:
        raise HTTPException(status_code=422, detail=f"Invalid status: {body.status}")

    result = await db.execute(
        select(Opportunity)
        .options(selectinload(Opportunity.listing).selectinload(EbayListing.parsed_card))
        .where(Opportunity.id == opportunity_id)
    )
    opp = result.scalar_one_or_none()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    opp.status = body.status
    if body.notes:
        opp.notes = body.notes
    await db.commit()
    await db.refresh(opp)
    return opp
