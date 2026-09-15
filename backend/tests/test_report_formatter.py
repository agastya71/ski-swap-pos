from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException
from fastapi.responses import JSONResponse

from app.schemas.reports import (
    EndOfDayReport,
    SellerPayoutReport,
    SellerPayoutSaleLine,
    SellerPayoutSellerInfo,
    SellerPayoutUnsoldLine,
)


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
        seller_email=None,
        seller_info=SellerPayoutSellerInfo(
            seller_code="ABC", seller_name="Jane Smith", company=None, is_vendor=False,
            email=None, phone="612-555-0100", address=None, city=None, state=None, zip=None,
            commission_rate=0.30,
        ),
        items_consigned=2, items_sold=1, items_unsold=1, items_donated=0,
        gross_sales=20.00, mysl_total=6.00, seller_total=14.00,
        sales=[
            SellerPayoutSaleLine(item_code="ABC-001", description="Skis",
                                 date_of_sale=datetime.now(timezone.utc),
                                 quantity_sold=1.0, sell_price=20.00, extended_price=20.00,
                                 mysl_share=6.0, seller_share=14.0, commission_rate=0.30),
        ],
        unsold_items=[
            SellerPayoutUnsoldLine(item_code="ABC-002", description="Boots",
                                   quantity=1.0, remaining=1.0, price=10.00,
                                   status="available", donate_unsold=False,
                                   mysl_share=0.0, seller_share=0.0, commission_rate=0.30),
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


def test_format_csv_payout_has_sales_and_unsold_sections():
    from app.services.report_formatter import format_report
    resp = format_report(_payout(), "csv", "payout_test")
    assert b"ABC-001" in resp.body
    assert b"SALES" in resp.body
    assert b"UNSOLD" in resp.body
    assert b"612-555-0100" in resp.body  # seller contact info


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


def test_format_unsold_report_donate_column():
    """The dedicated unsold report carries the per-item donate election."""
    import io

    from pypdf import PdfReader

    from app.schemas.reports import UnsoldItem, UnsoldItemsReport
    from app.services.report_formatter import format_report

    report = UnsoldItemsReport(
        event_id=1, event_name="Swap 2026",
        items=[
            UnsoldItem(seller_code="DU", seller_name="Donate Tester",
                       item_code="DU-001", description="Skis", category="Skis",
                       quantity=1.0, remaining=1.0, price=10.0, donate_unsold=True),
        ],
        total_items=1, total_value=10.0,
        generated_at=datetime.now(timezone.utc),
    )
    csv = format_report(report, "csv", "unsold_donate")
    assert b"donate" in csv.body
    assert b"Yes" in csv.body
    md = format_report(report, "md", "unsold_donate")
    assert b"| Donate |" in md.body
    pdf = format_report(report, "pdf", "unsold_donate")
    assert pdf.media_type == "application/pdf"
    text = "".join(page.extract_text() for page in PdfReader(io.BytesIO(pdf.body)).pages)
    assert "Donate" in text and "Yes" in text
