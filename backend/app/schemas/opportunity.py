from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ParsedCardOut(BaseModel):
    card_name: str
    set_name: str
    card_number: str
    language: str
    grader: str
    grade: Optional[float]
    cert_number: str
    variant: str
    parse_confidence: float
    risk_flags: list[str]
    image_flags: list[str]

    class Config:
        from_attributes = True


class ListingOut(BaseModel):
    id: int
    ebay_item_id: str
    title: str
    url: str
    listing_type: str
    current_price: float
    shipping_price: float
    total_price: float
    bid_count: int
    end_time: Optional[datetime]
    seller_username: str
    seller_feedback_score: int
    seller_feedback_percent: float
    condition: str
    image_urls: list[str]
    has_authenticity_guarantee: bool
    return_policy: str
    parsed_card: Optional[ParsedCardOut]

    class Config:
        from_attributes = True


class OpportunityOut(BaseModel):
    id: int
    listing_id: int
    market_value: float
    resale_value: float
    fee_estimate: float
    shipping_out: float
    supplies: float
    risk_buffer: float
    target_profit: float
    max_bid: float
    expected_profit: float
    roi: float
    profit_score: float
    roi_score: float
    confidence_score: float
    liquidity_score: float
    seller_score: float
    timing_score: float
    total_score: float
    signal: str
    status: str
    notes: str
    alerted_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    listing: ListingOut

    class Config:
        from_attributes = True


class OpportunityStatusUpdate(BaseModel):
    status: str  # watched / passed / won / lost / manual_review
    notes: Optional[str] = None
