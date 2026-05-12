from datetime import datetime
from typing import Optional
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


class Opportunity(Base):
    __tablename__ = "opportunities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    listing_id: Mapped[int] = mapped_column(Integer, ForeignKey("ebay_listings.id"), unique=True)
    matched_product_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("pricecharting_products.id"), nullable=True
    )

    market_value: Mapped[float] = mapped_column(Float, default=0.0)
    resale_value: Mapped[float] = mapped_column(Float, default=0.0)
    fee_estimate: Mapped[float] = mapped_column(Float, default=0.0)
    shipping_out: Mapped[float] = mapped_column(Float, default=0.0)
    supplies: Mapped[float] = mapped_column(Float, default=0.0)
    risk_buffer: Mapped[float] = mapped_column(Float, default=0.0)
    target_profit: Mapped[float] = mapped_column(Float, default=0.0)
    max_bid: Mapped[float] = mapped_column(Float, default=0.0)
    expected_profit: Mapped[float] = mapped_column(Float, default=0.0)
    roi: Mapped[float] = mapped_column(Float, default=0.0)

    profit_score: Mapped[float] = mapped_column(Float, default=0.0)
    roi_score: Mapped[float] = mapped_column(Float, default=0.0)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.0)
    liquidity_score: Mapped[float] = mapped_column(Float, default=0.0)
    seller_score: Mapped[float] = mapped_column(Float, default=0.0)
    timing_score: Mapped[float] = mapped_column(Float, default=0.0)
    total_score: Mapped[float] = mapped_column(Float, default=0.0)

    # GREEN / YELLOW / RED / PASS
    signal: Mapped[str] = mapped_column(String(16), default="PASS")
    # pending / watched / passed / won / lost / manual_review
    status: Mapped[str] = mapped_column(String(32), default="pending")
    notes: Mapped[str] = mapped_column(Text, default="")

    alerted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    listing: Mapped["EbayListing"] = relationship(back_populates="opportunity")
    matched_product: Mapped[Optional["PricechartingProduct"]] = relationship(back_populates="opportunities")
    purchase: Mapped[Optional["Purchase"]] = relationship(back_populates="opportunity")
