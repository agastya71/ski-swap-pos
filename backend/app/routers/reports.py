"""Reports router — generates end-of-event financial and inventory reports; requires admin role."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

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
