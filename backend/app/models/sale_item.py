"""SQLAlchemy model for the `sale_item` table."""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class SaleItem(Base):
    """Represents a single line item within a sale transaction.

    Each SaleItem links one inventory Item to one Sale and records the price and
    quantity at the moment of purchase. extended_price is the line total
    (sell_price * quantity) and is stored explicitly to guard against future
    price changes on the item record.
    """

    __tablename__ = "sale_item"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sale.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("item.id"), nullable=False)
    line_number = Column(Integer)
    quantity = Column(Float, default=1.0)
    sell_price = Column(Float, nullable=False)
    extended_price = Column(Float, nullable=False)
    notes = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    created_by = Column(String)

    sale = relationship("Sale", back_populates="sale_items")
    item = relationship("Item", back_populates="sale_items")
