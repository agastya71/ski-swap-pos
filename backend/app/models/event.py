"""SQLAlchemy model for the `event` table."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Event(Base):
    """Represents a single annual ski swap event (e.g., "MYSL Ski Swap 2026").

    An event is the top-level container for all other records — users, sellers,
    and sales all belong to one event. Only one event may be active at a time.
    The commission_rate set here is the default applied to individual sellers;
    vendor sellers (is_vendor=True) use vendor_commission_rate instead.
    """

    __tablename__ = "event"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    year = Column(Integer, nullable=False)
    commission_rate = Column(Float, nullable=False, default=0.30)  # MYSL's share for individual sellers
    vendor_commission_rate = Column(Float, nullable=False, default=0.30)  # MYSL's share for vendor sellers
    is_active = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    users = relationship("User", back_populates="event")
    sellers = relationship("Seller", back_populates="event")
    sales = relationship("Sale", back_populates="event")
