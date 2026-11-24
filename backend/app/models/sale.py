"""SQLAlchemy model for the `sale` table."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Sale(Base):
    """Represents a completed (or voided) customer purchase transaction.

    A sale belongs to one event and contains one or more sale items. Financial
    totals are pre-computed and stored for reporting: sale_total is the full
    purchase amount (line items; historically plus any credit-card fee),
    mysl_total is MYSL's commission portion, and seller_total is the remainder
    owed to sellers. Payment may be split across cash, check, and credit card;
    cc_fee records the buyer-paid 3% fee on pre-2026-11-24 rows. Voided sales
    are retained for audit purposes.
    """

    __tablename__ = "sale"
    __table_args__ = (
        Index(
            "uq_sale_event_transaction_number",
            "event_id",
            "transaction_number",
            unique=True,
        ),
    )

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
    cc_fee = Column(Float, nullable=False, default=0.0)
    """3% buyer-paid transaction fee on the card-financed portion (retained
    by MYSL); derived from the card terminal charge, not entered."""
    check_number = Column(String)
    cc_transaction_id = Column(String)  # Square transaction id / card reference
    total_paid = Column(Float, default=0.0)
    balance_due = Column(Float, default=0.0)
    notes = Column(String)
    is_voided = Column(Boolean, nullable=False, default=False)
    transaction_number = Column(Integer, nullable=True)
    """Per-event sequential display ID stamped when the sale starts (event
    feedback #12). Legacy rows were backfilled to their row id, so the number
    the UI always showed ("Sale #N") is unchanged. Voided/cancelled sales
    retire their number — the per-event sequence never reuses one. Nullable
    with no default: allocation belongs to reserve/checkout only; rows
    created by other paths simply carry no number (NULLs are distinct in the
    unique index, so they never collide)."""
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    created_by = Column(String)
    is_finalized = Column(Boolean, nullable=False, default=True)
    """False for a reserved-but-unfinished transaction (issue #12): the row
    exists only to pin its display ID from the moment the sale starts.
    Drafts are invisible to listings/reports; adoption at checkout finalizes
    the row. Legacy rows are all True (backfill)."""
    event = relationship("Event", back_populates="sales")
    sale_items = relationship("SaleItem", back_populates="sale")
