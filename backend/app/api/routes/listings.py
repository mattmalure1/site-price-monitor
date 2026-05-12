from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_db
from app.models.listing import EbayListing, ParsedCard
from app.schemas.opportunity import ListingOut

router = APIRouter(prefix="/listings", tags=["listings"])


@router.get("/", response_model=list[ListingOut])
async def list_listings(
    is_active: bool = Query(True),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(EbayListing)
        .options(selectinload(EbayListing.parsed_card))
        .where(EbayListing.is_active == is_active)
        .order_by(desc(EbayListing.created_at))
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{listing_id}", response_model=ListingOut)
async def get_listing(listing_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EbayListing)
        .options(selectinload(EbayListing.parsed_card))
        .where(EbayListing.id == listing_id)
    )
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing
