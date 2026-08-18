"""SQLAlchemy model for the `item` table."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Item(Base):
    """Represents a single piece of consignment merchandise submitted through an intake.

    Items belong to both a seller and a specific intake session. The unique code
    is used by cashiers to look up items at the point of sale. Status tracks the
    item's lifecycle from available through sold, donated, or returned. donate_unsold
    mirrors the seller's election at intake time but can be overridden per item.
    """

    __tablename__ = "item"

    id = Column(Integer, primary_key=True, index=True)
    intake_id = Column(Integer, ForeignKey("intake.id"), nullable=False)
    seller_id = Column(Integer, ForeignKey("seller.id"), nullable=False)
    code = Column(String, nullable=False, unique=True, index=True)
    category = Column(String)
    brand = Column(String)
    type = Column(String)
    description = Column(String)
    color = Column(String)
    size = Column(String)
    uom = Column(String)
    gender_age = Column(String)
    year = Column(Integer)
    used = Column(Boolean, default=True)
    price = Column(Float, nullable=False)
    quantity = Column(Float, default=1.0)
    barcode_39 = Column(String)
    label_line_2 = Column(String)
    label_line_3 = Column(String)
    donate_unsold = Column(Boolean, default=False)  # item goes to charity if unsold; copied from intake at creation
    status = Column(String, nullable=False, default="available")  # available/sold/donated/returned
    label_printed = Column(Boolean, nullable=False, default=False)
    is_deleted = Column(Boolean, nullable=False, default=False)  # soft delete; excluded from listings/lookup/reports/checkout
    vendor_item_id = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    created_by = Column(String)

    intake = relationship("Intake", back_populates="items")
    seller = relationship("Seller", back_populates="items")
    sale_items = relationship("SaleItem", back_populates="item")
