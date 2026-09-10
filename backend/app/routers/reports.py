"""Reports router — generates end-of-event financial and inventory reports; requires admin role."""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

import io
import zipfile

from app.database import get_db
from app.dependencies import require_roles
from app.models.user import User
from app.services import reports as report_svc
from app.services.report_formatter import format_report

router = APIRouter(prefix="/reports", tags=["reports"])

_ADMIN_ONLY = require_roles("admin")


@router.get("/{event_id}/seller/{seller_id}")
def get_seller_payout(
    event_id: int,
    seller_id: int,
    fmt: str = Query("json", alias="format"),
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    """Return the payout report for a single seller, showing sold items and proceeds."""
    report = report_svc.get_seller_payout(db, event_id, seller_id)
    return format_report(report, fmt, f"seller_payout_{event_id}_{seller_id}")


@router.get("/{event_id}/sellers-payouts")
def get_all_seller_payouts(
    event_id: int,
    fmt: str = Query("json", alias="format"),
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    """Return payout reports for ALL sellers in the event (sorted by code).

    Each entry carries the seller's contact information, a SALES section
    (every non-voided sale line with prices and commission shares) and an
    UNSOLD ITEMS section (every item still on hand). CSV/MD/PDF downloads
    render a per-seller summary table with grand totals; JSON carries the
    full per-seller detail.
    """
    report = report_svc.get_all_seller_payouts(db, event_id)
    return format_report(report, fmt, f"sellers_payouts_{event_id}")


@router.get("/{event_id}/sellers-payouts/export-zip")
def export_sellers_payouts_zip(
    event_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    """Download a ZIP containing one Excel workbook and one PDF per seller.

    Each seller's payout is exported as ``{seller_code}_payout.xlsx`` (three
    sheets: Summary, Sales, Unsold Items) and ``{seller_code}_payout.pdf``,
    so every seller's settlement can be distributed individually.
    """
    report = report_svc.get_all_seller_payouts(db, event_id)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in report.sellers:
            base = f"{p.seller_code}_payout"
            zf.writestr(f"{base}.xlsx", format_report(p, "xlsx", base).body)
            zf.writestr(f"{base}.pdf", format_report(p, "pdf", base).body)
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="sellers_payouts_{event_id}.zip"'},
    )


@router.get("/{event_id}/revenue")
def get_revenue(
    event_id: int,
    fmt: str = Query("json", alias="format"),
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    """Return the total revenue summary for an event."""
    report = report_svc.get_event_revenue(db, event_id)
    return format_report(report, fmt, f"revenue_{event_id}")


@router.get("/{event_id}/donations")
def get_donations(
    event_id: int,
    fmt: str = Query("json", alias="format"),
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    """Return a report of proceeds donated by sellers who opted in."""
    report = report_svc.get_donations(db, event_id)
    return format_report(report, fmt, f"donations_{event_id}")


@router.get("/{event_id}/unsold")
def get_unsold(
    event_id: int,
    fmt: str = Query("json", alias="format"),
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    """Return a list of all unsold items remaining at the end of the event."""
    report = report_svc.get_unsold_items(db, event_id)
    return format_report(report, fmt, f"unsold_{event_id}")


@router.get("/{event_id}/transactions-by-user")
def get_transactions_by_user_report(
    event_id: int,
    fmt: str = Query("json", alias="format"),
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    """Return every event transaction grouped by the user who recorded it.

    Aggregates per cashier (sale.created_by): transaction listings newest-first
    plus per-user and grand totals. Non-voided sales feed revenue aggregates;
    voided transactions are listed flagged and counted separately.
    """
    report = report_svc.get_transactions_by_user(db, event_id)
    return format_report(report, fmt, f"transactions_by_user_{event_id}")


@router.get("/{event_id}/end-of-day")
def get_end_of_day(
    event_id: int,
    fmt: str = Query("json", alias="format"),
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    """Return the end-of-day summary report for an event."""
    report = report_svc.get_end_of_day(db, event_id)
    return format_report(report, fmt, f"end_of_day_{event_id}")
