from datetime import datetime
from typing import Optional
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


class Purchase(Base):
    __tablename__ = "purchases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    listing_id: Mapped[int] = mapped_column(Integer, ForeignKey("ebay_listings.id"), unique=True)
    opportunity_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("opportunities.id"), nullable=True
    )

    purchase_price: Mapped[float] = mapped_column(Float)
    shipping_paid: Mapped[float] = mapped_column(Float, default=0.0)
    total_cost: Mapped[float] = mapped_column(Float)

    won_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    received_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    listed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    sold_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    sale_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sale_platform: Mapped[str] = mapped_column(String(64), default="eBay")
    ebay_fees_paid: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    net_profit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    days_to_sell: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # pending_receipt / in_inventory / listed / sold
    status: Mapped[str] = mapped_column(String(32), default="pending_receipt")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    listing: Mapped["EbayListing"] = relationship(back_populates="purchase")
    opportunity: Mapped[Optional["Opportunity"]] = relationship(back_populates="purchase")
