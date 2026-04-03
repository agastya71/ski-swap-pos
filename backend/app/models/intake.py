from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Intake(Base):
    __tablename__ = "intake"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, ForeignKey("seller.id"), nullable=False)
    date_entered = Column(Date)
    date_received = Column(Date)
    donate_unsold = Column(Boolean, nullable=False, default=False)
    donate_proceeds = Column(Boolean, nullable=False, default=False)
    total = Column(Float, default=0.0)
    mysl_total = Column(Float, default=0.0)
    seller_total = Column(Float, default=0.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    created_by = Column(String)

    seller = relationship("Seller", back_populates="intakes")
    items = relationship("Item", back_populates="intake")
