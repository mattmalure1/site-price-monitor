from datetime import datetime
from typing import Optional
from sqlalchemy import String, Float, Integer, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


class PricechartingProduct(Base):
    __tablename__ = "pricecharting_products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pricecharting_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    product_name: Mapped[str] = mapped_column(String(512))
    console_name: Mapped[str] = mapped_column(String(128), default="")
    set_name: Mapped[str] = mapped_column(String(256), default="")
    card_number: Mapped[str] = mapped_column(String(32), default="")

    loose_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    grade_7_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    grade_8_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    grade_9_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    psa_10_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cgc_10_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bgs_10_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sgc_10_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sales_volume: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    opportunities: Mapped[list["Opportunity"]] = relationship(back_populates="matched_product")

    __table_args__ = (
        Index("ix_pc_product_name", "product_name"),
        Index("ix_pc_set_card", "set_name", "card_number"),
    )

    def price_for_grade(self, grader: str, grade: float) -> Optional[float]:
        """Return the appropriate price given grader and grade."""
        if grader == "PSA":
            if grade == 10:
                return self.psa_10_price
            if grade == 9:
                return self.grade_9_price
            if grade == 8:
                return self.grade_8_price
            if grade == 7:
                return self.grade_7_price
        elif grader == "CGC":
            if grade == 10:
                return self.cgc_10_price
            if grade == 9:
                return self.grade_9_price
        elif grader == "BGS":
            if grade >= 9.5:
                return self.bgs_10_price
            if grade == 9:
                return self.grade_9_price
        elif grader == "SGC":
            if grade == 10:
                return self.sgc_10_price
        return self.loose_price
