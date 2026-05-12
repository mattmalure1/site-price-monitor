from datetime import datetime
from sqlalchemy import String, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class BlacklistRule(Base):
    __tablename__ = "blacklist_rules"

    id: Mapped[int] = mapped_column(String(64), primary_key=True)
    # keyword / seller / grader / title_pattern
    rule_type: Mapped[str] = mapped_column(String(32))
    value: Mapped[str] = mapped_column(String(512))
    reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
