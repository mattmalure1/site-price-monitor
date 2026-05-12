from datetime import datetime
from typing import Optional
from sqlalchemy import String, Float, Integer, DateTime, Boolean, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


class EbayListing(Base):
    __tablename__ = "ebay_listings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ebay_item_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(512))
    url: Mapped[str] = mapped_column(String(512))
    listing_type: Mapped[str] = mapped_column(String(32))  # AUCTION / BIN / BEST_OFFER
    current_price: Mapped[float] = mapped_column(Float)
    shipping_price: Mapped[float] = mapped_column(Float, default=0.0)
    total_price: Mapped[float] = mapped_column(Float)
    bid_count: Mapped[int] = mapped_column(Integer, default=0)
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    seller_username: Mapped[str] = mapped_column(String(128))
    seller_feedback_score: Mapped[int] = mapped_column(Integer, default=0)
    seller_feedback_percent: Mapped[float] = mapped_column(Float, default=0.0)
    condition: Mapped[str] = mapped_column(String(128), default="")
    image_urls: Mapped[list] = mapped_column(JSON, default=list)
    has_authenticity_guarantee: Mapped[bool] = mapped_column(Boolean, default=False)
    return_policy: Mapped[str] = mapped_column(String(256), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    parsed_card: Mapped[Optional["ParsedCard"]] = relationship(back_populates="listing", uselist=False)
    opportunity: Mapped[Optional["Opportunity"]] = relationship(back_populates="listing", uselist=False)
    purchase: Mapped[Optional["Purchase"]] = relationship(back_populates="listing", uselist=False)


class ParsedCard(Base):
    __tablename__ = "parsed_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    listing_id: Mapped[int] = mapped_column(Integer, ForeignKey("ebay_listings.id"), unique=True)
    game: Mapped[str] = mapped_column(String(64), default="Pokemon")
    card_name: Mapped[str] = mapped_column(String(256), default="")
    set_name: Mapped[str] = mapped_column(String(256), default="")
    card_number: Mapped[str] = mapped_column(String(32), default="")
    language: Mapped[str] = mapped_column(String(32), default="English")
    grader: Mapped[str] = mapped_column(String(32), default="")  # PSA / CGC / BGS / SGC
    grade: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cert_number: Mapped[str] = mapped_column(String(64), default="")
    variant: Mapped[str] = mapped_column(String(128), default="")
    parse_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    image_flags: Mapped[list] = mapped_column(JSON, default=list)
    risk_flags: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    listing: Mapped["EbayListing"] = relationship(back_populates="parsed_card")
