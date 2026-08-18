"""SQLAlchemy model for the `sale` table."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Sale(Base):
    """Represents a completed (or voided) customer purchase transaction.

    A sale belongs to one event and contains one or more sale items. Financial
    totals are pre-computed and stored for reporting: sale_total is the full
    purchase amount, mysl_total is MYSL's commission portion, and seller_total
    is the remainder owed to sellers. Payment may be split across cash, check,
    and credit card. Voided sales are retained for audit purposes.
    """

    __tablename__ = "sale"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("event.id"), nullable=False)
    date_of_sale = Column(DateTime)  # full timestamp of the transaction
    customer_name = Column(String)
    customer_email = Column(String)
    sale_total = Column(Float, nullable=False, default=0.0)
    mysl_total = Column(Float, nullable=False, default=0.0)
    seller_total = Column(Float, nullable=False, default=0.0)
    cash_amount = Column(Float, default=0.0)
    check_amount = Column(Float, default=0.0)
    cc_amount = Column(Float, default=0.0)
    check_number = Column(String)
    cc_transaction_id = Column(String)  # Square transaction id / card reference
    total_paid = Column(Float, default=0.0)
    balance_due = Column(Float, default=0.0)
    notes = Column(String)
    is_voided = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    created_by = Column(String)

    event = relationship("Event", back_populates="sales")
    sale_items = relationship("SaleItem", back_populates="sale")
