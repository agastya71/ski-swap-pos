"""SQLAlchemy model for the `intake` table."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Intake(Base):
    """Represents a single drop-off session where a seller submits items for consignment.

    A seller may have multiple intakes across an event. The intake records the
    seller's donation preferences and pre-computed financial totals (updated when
    items sell). donate_unsold and donate_proceeds are seller-level elections that
    propagate to individual items at intake time.
    """

    __tablename__ = "intake"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, ForeignKey("seller.id"), nullable=False)
    date_entered = Column(Date)
    date_received = Column(Date)
    donate_unsold = Column(Boolean, nullable=False, default=False)  # unsold items go to charity instead of being returned
    donate_proceeds = Column(Boolean, nullable=False, default=False)  # seller donates their share of sale proceeds to MYSL
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
