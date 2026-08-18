"""SQLAlchemy model for the `seller` table."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class Seller(Base):
    """Represents a consignment seller (or vendor) registered for an event.

    Each seller belongs to one event and is identified within that event by a
    short alphanumeric code. Sellers submit items through one or more intakes.
    Vendors (is_vendor=True) are commercial dealers whose items are handled
    separately from individual consignors.
    """

    __tablename__ = "seller"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("event.id"), nullable=False)
    code = Column(String, nullable=False)
    # first_name/last_name are optional for vendor sellers (businesses, not people).
    # The individual-vs-vendor name requirement is enforced in SellerCreate validators.
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    company = Column(String)
    is_vendor = Column(Boolean, nullable=False, default=False)
    email = Column(String)
    phone = Column(String)
    address = Column(String)
    city = Column(String)
    state = Column(String)
    zip = Column(String)
    # Per-seller donation defaults that pre-populate the corresponding intake flags
    # at intake creation. Intake flags can still be overridden per intake/per item.
    donate_unsold_default = Column(Boolean, nullable=False, default=False)
    donate_proceeds_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    created_by = Column(String)

    __table_args__ = (UniqueConstraint("event_id", "code", name="uq_seller_event_code"),)

    event = relationship("Event", back_populates="sellers")
    intakes = relationship("Intake", back_populates="seller")
    items = relationship("Item", back_populates="seller")
