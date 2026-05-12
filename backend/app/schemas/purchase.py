from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class PurchaseCreate(BaseModel):
    listing_id: int
    opportunity_id: Optional[int] = None
    purchase_price: float
    shipping_paid: float = 0.0


class PurchaseSaleUpdate(BaseModel):
    sale_price: float
    ebay_fees_paid: float
    sale_platform: str = "eBay"
    sold_at: Optional[datetime] = None


class PurchaseOut(BaseModel):
    id: int
    listing_id: int
    purchase_price: float
    shipping_paid: float
    total_cost: float
    won_at: Optional[datetime]
    received_at: Optional[datetime]
    listed_at: Optional[datetime]
    sold_at: Optional[datetime]
    sale_price: Optional[float]
    sale_platform: str
    ebay_fees_paid: Optional[float]
    net_profit: Optional[float]
    days_to_sell: Optional[int]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class BankrollStatus(BaseModel):
    daily_spent: float
    daily_limit: float
    monthly_spent: float
    monthly_limit: float
    open_auctions: int
    max_open_auctions: int
    available_today: float
    available_month: float
