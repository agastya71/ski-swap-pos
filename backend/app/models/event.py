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
    Sellers whose (case-insensitive) code appears in ``exempt_seller_codes``
    are EXEMPT from commission: their sale lines carry the full price as the
    seller share and 0 as the MYSL share (e.g. MYSL's own vendor stall).
    """

    __tablename__ = "event"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    year = Column(Integer, nullable=False)
    commission_rate = Column(Float, nullable=False, default=0.30)  # MYSL's share for individual sellers
    vendor_commission_rate = Column(Float, nullable=False, default=0.30)  # MYSL's share for vendor sellers
    # Comma-separated seller codes exempt from commission (e.g. 'MYSL2').
    # Null/empty = no exemptions. Compared case-insensitively at report time.
    exempt_seller_codes = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    users = relationship("User", back_populates="event")
    sellers = relationship("Seller", back_populates="event")
    sales = relationship("Sale", back_populates="event")
