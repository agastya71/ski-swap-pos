"""Report serialisation service supporting JSON, CSV, Markdown, and PDF output.

Converts a typed Pydantic report model into an HTTP ``Response`` in the
caller's requested format.  Each private helper handles one output format and
is dispatched by the public ``format_report`` entry point.
"""

import csv
import io

from fastapi import HTTPException
from fastapi.responses import JSONResponse, Response
from fpdf import FPDF
from pydantic import BaseModel

from app.schemas.reports import (
    DonationsReport,
    EndOfDayReport,
    EventRevenueReport,
    SellerPayoutReport,
    UnsoldItemsReport,
)

_VALID_FORMATS = {"json", "csv", "md", "pdf"}


def format_report(report: BaseModel, fmt: str, filename_base: str) -> Response:
    """Serialise a report model into the requested output format.

    Args:
        report: A Pydantic report model instance (e.g. ``SellerPayoutReport``).
        fmt: Desired output format — one of ``"json"``, ``"csv"``, ``"md"``,
            or ``"pdf"``.
        filename_base: Base filename (without extension) used in the
            ``Content-Disposition`` header for downloadable formats.

    Returns:
        A FastAPI ``Response`` (or ``JSONResponse``) with the appropriate
        ``media_type`` and ``Content-Disposition`` header set.

    Raises:
        HTTPException: 422 if ``fmt`` is not one of the valid format strings.
    """
    if fmt not in _VALID_FORMATS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid format: must be {', '.join(sorted(_VALID_FORMATS))}",
        )
    if fmt == "json":
        return JSONResponse(content=report.model_dump(mode="json"))
    if fmt == "csv":
        return _to_csv(report, filename_base)
    if fmt == "md":
        return _to_md(report, filename_base)
    return _to_pdf(report, filename_base)


def _to_csv(report: BaseModel, filename_base: str) -> Response:
    """Render a report as a downloadable CSV response."""
    out = io.StringIO()
    w = csv.writer(out)

    if isinstance(report, SellerPayoutReport):
        w.writerow(["seller_code", "seller_name", "items_consigned", "items_sold",
                    "items_unsold", "items_donated", "gross_sales", "mysl_total", "seller_total"])
        w.writerow([report.seller_code, report.seller_name, report.items_consigned,
                    report.items_sold, report.items_unsold, report.items_donated,
                    report.gross_sales, report.mysl_total, report.seller_total])
        w.writerow([])
        w.writerow(["item_code", "description", "price", "sell_price", "status"])
        for li in report.line_items:
            w.writerow([li.item_code, li.description, li.price, li.sell_price, li.status])
    elif isinstance(report, DonationsReport):
        w.writerow(["seller_code", "item_code", "description", "price", "donation_type"])
        for item in report.items:
            w.writerow([item.seller_code, item.item_code, item.description,
                        item.price, item.donation_type])
    elif isinstance(report, UnsoldItemsReport):
        w.writerow(["seller_code", "item_code", "description", "category", "price"])
        for item in report.items:
            w.writerow([item.seller_code, item.item_code, item.description,
                        item.category, item.price])
    else:
        data = report.model_dump(mode="json")
        w.writerow(list(data.keys()))
        w.writerow(list(data.values()))

    return Response(
        content=out.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename_base}.csv"'},
    )


def _to_md(report: BaseModel, filename_base: str) -> Response:
    """Render a report as a downloadable Markdown response."""
    lines: list[str] = []

    if isinstance(report, SellerPayoutReport):
        lines += [
            f"# Seller Payout: {report.seller_name} ({report.seller_code})",
            f"**Event:** {report.event_name}  ",
            f"**Generated:** {report.generated_at.isoformat()}",
            "",
            "## Summary",
            "| Consigned | Sold | Unsold | Donated | Gross Sales | MYSL Total | Seller Total |",
            "|-----------|------|--------|---------|-------------|------------|--------------|",
            f"| {report.items_consigned} | {report.items_sold} | {report.items_unsold} | "
            f"{report.items_donated} | ${report.gross_sales:.2f} | ${report.mysl_total:.2f} | "
            f"${report.seller_total:.2f} |",
            "", "## Line Items",
            "| Item Code | Description | Price | Sell Price | Status |",
            "|-----------|-------------|-------|------------|--------|",
        ]
        for li in report.line_items:
            lines.append(f"| {li.item_code} | {li.description or ''} | ${li.price:.2f} | "
                         f"${li.sell_price:.2f} | {li.status} |")
    elif isinstance(report, EventRevenueReport):
        lines += [
            f"# Event Revenue: {report.event_name}",
            f"**Generated:** {report.generated_at.isoformat()}", "",
            "| Metric | Value |", "|--------|-------|",
            f"| Total Sales | {report.total_sales} |",
            f"| Voided Sales | {report.voided_sales} |",
            f"| Gross Revenue | ${report.gross_revenue:.2f} |",
            f"| MYSL Total | ${report.mysl_total:.2f} |",
            f"| Seller Total | ${report.seller_total:.2f} |",
            f"| Cash | ${report.cash_total:.2f} |",
            f"| Check | ${report.check_total:.2f} |",
            f"| Credit Card | ${report.cc_total:.2f} |",
            f"| Donate Proceeds | ${report.donate_proceeds_total:.2f} |",
        ]
    elif isinstance(report, DonationsReport):
        lines += [
            f"# Donations: {report.event_name}",
            f"**Total Items:** {report.total_items}  **Total Value:** ${report.total_value:.2f}  ",
            f"**Generated:** {report.generated_at.isoformat()}", "",
            "| Seller | Item Code | Description | Price | Type |",
            "|--------|-----------|-------------|-------|------|",
        ]
        for item in report.items:
            lines.append(f"| {item.seller_code} | {item.item_code} | {item.description or ''} | "
                         f"${item.price:.2f} | {item.donation_type} |")
    elif isinstance(report, UnsoldItemsReport):
        lines += [
            f"# Unsold Items: {report.event_name}",
            f"**Total Items:** {report.total_items}  **Total Value:** ${report.total_value:.2f}  ",
            f"**Generated:** {report.generated_at.isoformat()}", "",
            "| Seller | Item Code | Description | Category | Price |",
            "|--------|-----------|-------------|----------|-------|",
        ]
        for item in report.items:
            lines.append(f"| {item.seller_code} | {item.item_code} | {item.description or ''} | "
                         f"{item.category or ''} | ${item.price:.2f} |")
    elif isinstance(report, EndOfDayReport):
        lines += [
            f"# End of Day: {report.event_name}",
            f"**Date:** {report.date_generated}  **Generated:** {report.generated_at.isoformat()}",
            "", "| Metric | Value |", "|--------|-------|",
            f"| Sales | {report.sales_count} |",
            f"| Voided | {report.voided_count} |",
            f"| Gross Revenue | ${report.gross_revenue:.2f} |",
            f"| MYSL Total | ${report.mysl_total:.2f} |",
            f"| Seller Total | ${report.seller_total:.2f} |",
            f"| Cash | ${report.cash_total:.2f} |",
            f"| Check | ${report.check_total:.2f} |",
            f"| Credit Card | ${report.cc_total:.2f} |",
        ]

    return Response(
        content="\n".join(lines),
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename_base}.md"'},
    )


def _safe(text: str) -> str:
    """Encode ``text`` as Latin-1, replacing unencodable characters."""
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _to_pdf(report: BaseModel, filename_base: str) -> Response:
    """Render a report as a downloadable PDF response using fpdf2."""
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "MYSL Ski Swap POS")
    pdf.ln()
    pdf.set_font("Helvetica", "", 12)

    if isinstance(report, SellerPayoutReport):
        pdf.cell(0, 8, _safe(f"Seller Payout: {report.seller_name} ({report.seller_code})"))
        pdf.ln()
        pdf.cell(0, 6, _safe(f"Event: {report.event_name}"))
        pdf.ln()
        pdf.cell(0, 6, f"Generated: {report.generated_at.strftime('%Y-%m-%d %H:%M UTC')}")
        pdf.ln(8)
        pdf.set_font("Helvetica", "B", 10)
        for hdr in ["Gross Sales", "MYSL Total", "Seller Total"]:
            pdf.cell(45, 6, hdr, border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 10)
        for val in [f"${report.gross_sales:.2f}", f"${report.mysl_total:.2f}",
                    f"${report.seller_total:.2f}"]:
            pdf.cell(45, 6, val, border=1)
        pdf.ln(10)
        pdf.set_font("Helvetica", "B", 10)
        for hdr, width in [("Item Code", 30), ("Description", 65), ("Price", 25),
                            ("Sell Price", 25), ("Status", 25)]:
            pdf.cell(width, 6, hdr, border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 9)
        for li in report.line_items:
            if pdf.get_y() > 260:
                pdf.add_page()
                pdf.set_font("Helvetica", "B", 10)
                for hdr, width in [("Item Code", 30), ("Description", 65), ("Price", 25),
                                    ("Sell Price", 25), ("Status", 25)]:
                    pdf.cell(width, 6, hdr, border=1)
                pdf.ln()
                pdf.set_font("Helvetica", "", 9)
            pdf.cell(30, 6, _safe(li.item_code), border=1)
            pdf.cell(65, 6, _safe((li.description or "")[:35]), border=1)
            pdf.cell(25, 6, f"${li.price:.2f}", border=1)
            pdf.cell(25, 6, f"${li.sell_price:.2f}", border=1)
            pdf.cell(25, 6, _safe(li.status), border=1)
            pdf.ln()

    elif isinstance(report, EventRevenueReport):
        pdf.cell(0, 8, _safe(f"Event Revenue: {report.event_name}"))
        pdf.ln()
        pdf.cell(0, 6, f"Generated: {report.generated_at.strftime('%Y-%m-%d %H:%M UTC')}")
        pdf.ln(6)
        pdf.set_font("Helvetica", "", 11)
        for label, value in [
            ("Total Sales", str(report.total_sales)),
            ("Voided Sales", str(report.voided_sales)),
            ("Gross Revenue", f"${report.gross_revenue:.2f}"),
            ("MYSL Total", f"${report.mysl_total:.2f}"),
            ("Seller Total", f"${report.seller_total:.2f}"),
            ("Cash", f"${report.cash_total:.2f}"),
            ("Check", f"${report.check_total:.2f}"),
            ("Credit Card", f"${report.cc_total:.2f}"),
            ("Donate Proceeds", f"${report.donate_proceeds_total:.2f}"),
        ]:
            pdf.cell(80, 7, label, border=1)
            pdf.cell(40, 7, value, border=1)
            pdf.ln()

    elif isinstance(report, DonationsReport):
        pdf.cell(0, 8, _safe(f"Donations: {report.event_name}"))
        pdf.ln()
        pdf.cell(0, 6, f"Total Items: {report.total_items}  Total Value: ${report.total_value:.2f}")
        pdf.ln(6)
        pdf.set_font("Helvetica", "B", 10)
        for hdr, width in [("Seller", 25), ("Item Code", 30), ("Description", 65),
                            ("Price", 25), ("Type", 25)]:
            pdf.cell(width, 6, hdr, border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 9)
        for item in report.items:
            if pdf.get_y() > 260:
                pdf.add_page()
                pdf.set_font("Helvetica", "B", 10)
                for hdr, width in [("Seller", 25), ("Item Code", 30), ("Description", 65),
                                    ("Price", 25), ("Type", 25)]:
                    pdf.cell(width, 6, hdr, border=1)
                pdf.ln()
                pdf.set_font("Helvetica", "", 9)
            pdf.cell(25, 6, _safe(item.seller_code), border=1)
            pdf.cell(30, 6, _safe(item.item_code), border=1)
            pdf.cell(65, 6, _safe((item.description or "")[:35]), border=1)
            pdf.cell(25, 6, f"${item.price:.2f}", border=1)
            pdf.cell(25, 6, _safe(item.donation_type), border=1)
            pdf.ln()

    elif isinstance(report, UnsoldItemsReport):
        pdf.cell(0, 8, _safe(f"Unsold Items: {report.event_name}"))
        pdf.ln()
        pdf.cell(0, 6, f"Total Items: {report.total_items}  Total Value: ${report.total_value:.2f}")
        pdf.ln(6)
        pdf.set_font("Helvetica", "B", 10)
        for hdr, width in [("Seller", 25), ("Item Code", 30), ("Description", 65),
                            ("Category", 30), ("Price", 20)]:
            pdf.cell(width, 6, hdr, border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 9)
        for item in report.items:
            if pdf.get_y() > 260:
                pdf.add_page()
                pdf.set_font("Helvetica", "B", 10)
                for hdr, width in [("Seller", 25), ("Item Code", 30), ("Description", 65),
                                    ("Category", 30), ("Price", 20)]:
                    pdf.cell(width, 6, hdr, border=1)
                pdf.ln()
                pdf.set_font("Helvetica", "", 9)
            pdf.cell(25, 6, _safe(item.seller_code), border=1)
            pdf.cell(30, 6, _safe(item.item_code), border=1)
            pdf.cell(65, 6, _safe((item.description or "")[:35]), border=1)
            pdf.cell(30, 6, _safe(item.category or ""), border=1)
            pdf.cell(20, 6, f"${item.price:.2f}", border=1)
            pdf.ln()

    elif isinstance(report, EndOfDayReport):
        pdf.cell(0, 8, _safe(f"End of Day: {report.event_name}"))
        pdf.ln()
        pdf.cell(0, 6, f"Date: {report.date_generated}  "
                       f"Generated: {report.generated_at.strftime('%H:%M UTC')}")
        pdf.ln(6)
        pdf.set_font("Helvetica", "", 11)
        for label, value in [
            ("Sales", str(report.sales_count)),
            ("Voided", str(report.voided_count)),
            ("Gross Revenue", f"${report.gross_revenue:.2f}"),
            ("MYSL Total", f"${report.mysl_total:.2f}"),
            ("Seller Total", f"${report.seller_total:.2f}"),
            ("Cash", f"${report.cash_total:.2f}"),
            ("Check", f"${report.check_total:.2f}"),
            ("Credit Card", f"${report.cc_total:.2f}"),
        ]:
            pdf.cell(80, 7, label, border=1)
            pdf.cell(40, 7, value, border=1)
            pdf.ln()

    return Response(
        content=bytes(pdf.output()),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename_base}.pdf"'},
    )
