from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException
from fastapi.responses import JSONResponse

from app.schemas.reports import EndOfDayReport, SellerPayoutReport, SellerPayoutLineItem


def _eod():
    return EndOfDayReport(
        event_id=1, event_name="Test Event",
        date_generated=date.today(),
        sales_count=5, voided_count=1,
        gross_revenue=100.00, mysl_total=30.00, seller_total=70.00,
        cash_total=50.00, check_total=30.00, cc_total=20.00,
        generated_at=datetime.now(timezone.utc),
    )


def _payout():
    return SellerPayoutReport(
        event_id=1, event_name="Test Event",
        seller_id=1, seller_code="ABC", seller_name="Jane Smith",
        items_consigned=2, items_sold=1, items_unsold=1, items_donated=0,
        gross_sales=20.00, mysl_total=6.00, seller_total=14.00,
        line_items=[
            SellerPayoutLineItem(item_code="ABC-001", description="Skis",
                                 quantity=1.0, remaining=0.0,
                                 price=20.00, sell_price=20.00, status="sold", mysl_share=6.0, seller_share=14.0, commission_rate=0.30),
        ],
        generated_at=datetime.now(timezone.utc),
    )


def test_format_json_returns_json_response():
    from app.services.report_formatter import format_report
    resp = format_report(_eod(), "json", "eod_test")
    assert isinstance(resp, JSONResponse)


def test_format_csv_content_type():
    from app.services.report_formatter import format_report
    resp = format_report(_eod(), "csv", "eod_test")
    assert resp.media_type == "text/csv"
    assert b"gross_revenue" in resp.body


def test_format_csv_payout_has_line_items():
    from app.services.report_formatter import format_report
    resp = format_report(_payout(), "csv", "payout_test")
    assert b"ABC-001" in resp.body


def test_format_md_content_type():
    from app.services.report_formatter import format_report
    resp = format_report(_eod(), "md", "eod_test")
    assert resp.media_type == "text/markdown"
    assert b"End of Day" in resp.body


def test_format_pdf_content_type():
    from app.services.report_formatter import format_report
    resp = format_report(_eod(), "pdf", "eod_test")
    assert resp.media_type == "application/pdf"
    assert resp.body[:4] == b"%PDF"


def test_format_invalid_raises_422():
    from app.services.report_formatter import format_report
    with pytest.raises(HTTPException) as exc:
        format_report(_eod(), "xml", "eod_test")
    assert exc.value.status_code == 422
