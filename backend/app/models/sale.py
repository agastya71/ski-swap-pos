from datetime import datetime, timezone

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Sale(Base):
    __tablename__ = "sale"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("event.id"), nullable=False)
    date_of_sale = Column(Date)
    customer_name = Column(String)
    customer_email = Column(String)
    sale_total = Column(Float, nullable=False, default=0.0)
    mysl_total = Column(Float, nullable=False, default=0.0)
    seller_total = Column(Float, nullable=False, default=0.0)
    cash_amount = Column(Float, default=0.0)
    check_amount = Column(Float, default=0.0)
    cc_amount = Column(Float, default=0.0)
    check_number = Column(String)
    total_paid = Column(Float, default=0.0)
    balance_due = Column(Float, default=0.0)
    notes = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    created_by = Column(String)

    event = relationship("Event", back_populates="sales")
    sale_items = relationship("SaleItem", back_populates="sale")
