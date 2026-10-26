"""SQLAlchemy model for the `sale_edit` audit table (transaction editing).

Written by ``app/services/sale_edit.py`` for every edit action on a sale
(line add/update/remove, payment/info update). Rows are append-only: an edit
is never rewritten and a removed sale line survives here via its ``before``
snapshot JSON, so payouts and receipts stay reconstructable after the fact.

``sale_item_id`` is intentionally a PLAIN INTEGER (no FK): hard-deleted
``sale_item`` rows must not break the delete, and the snapshot JSON is the
source of truth for removed lines.
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String

from app.database import Base


class SaleEdit(Base):
    """One audited edit action on a sale (add/update/remove line, fix payments/info)."""

    __tablename__ = "sale_edit"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sale.id"), nullable=False, index=True)
    sale_item_id = Column(Integer)  # line reference at edit time (may no longer exist)
    action = Column(String, nullable=False)  # add_line | update_line | remove_line | update_payments | update_info
    before = Column(JSON)  # affected snapshot before the change (None for add_line)
    after = Column(JSON)  # affected snapshot after the change (None for remove_line)
    edited_by = Column(String, nullable=False)
    edited_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )