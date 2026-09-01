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
    TransactionsByUserReport,
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
        w.writerow(["item_code", "description", "quantity", "remaining", "price", "sell_price",
                    "status", "mysl_share", "seller_share", "commission_rate"])
        for li in report.line_items:
            w.writerow([li.item_code, li.description, li.quantity, li.remaining, li.price, li.sell_price,
                        li.status, li.mysl_share, li.seller_share, li.commission_rate])
    elif isinstance(report, DonationsReport):
        w.writerow(["seller_code", "item_code", "description", "quantity", "remaining", "price", "donation_type"])
        for item in report.items:
            w.writerow([item.seller_code, item.item_code, item.description,
                        item.quantity, item.remaining, item.price, item.donation_type])
    elif isinstance(report, UnsoldItemsReport):
        w.writerow(["seller_code", "item_code", "description", "category", "quantity", "remaining", "price"])
        for item in report.items:
            w.writerow([item.seller_code, item.item_code, item.description,
                        item.category, item.quantity, item.remaining, item.price])
    elif isinstance(report, TransactionsByUserReport):
        # Section 1: per-cashier summary; Section 2: one row per transaction.
        w.writerow(["cashier", "sales", "voided", "gross_sales", "mysl_total",
                    "seller_total", "cash_total", "check_total", "cc_total"])
        for u in report.users:
            w.writerow([u.cashier, u.sales_count, u.voided_count, u.gross_sales,
                        u.mysl_total, u.seller_total, u.cash_total,
                        u.check_total, u.cc_total])
        w.writerow([])
        w.writerow(["cashier", "sale_id", "date_of_sale", "items", "units",
                    "sale_total", "mysl_total", "seller_total", "cash", "check",
                    "cc", "is_voided"])
        for u in report.users:
            for t in u.transactions:
                w.writerow([t.cashier, t.sale_id, t.date_of_sale, t.items_count,
                            t.units_sold, t.sale_total, t.mysl_total, t.seller_total,
                            t.cash_amount, t.check_amount, t.cc_amount, t.is_voided])
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
            "| Item Code | Description | Qty | Remaining | Price | Sell Price | Status | MYSL | Seller | Rate |",
            "|-----------|-------------|-----|-----------|-------|------------|--------|-------|--------|------|",
        ]
        for li in report.line_items:
            lines.append(f"| {li.item_code} | {li.description or ''} | {li.quantity:G} | {li.remaining:G} | ${li.price:.2f} | "
                         f"${li.sell_price:.2f} | {li.status} | ${li.mysl_share:.2f} | "
                         f"${li.seller_share:.2f} | {li.commission_rate:.0%} |")
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
            "| Seller | Item Code | Description | Qty | Remaining | Price | Type |",
            "|--------|-----------|-------------|-----|-----------|-------|------|",
        ]
        for item in report.items:
            lines.append(f"| {item.seller_code} | {item.item_code} | {item.description or ''} | "
                         f"{item.quantity:G} | {item.remaining:G} | ${item.price:.2f} | {item.donation_type} |")
    elif isinstance(report, UnsoldItemsReport):
        lines += [
            f"# Unsold Items: {report.event_name}",
            f"**Total Items:** {report.total_items}  **Total Value:** ${report.total_value:.2f}  ",
            f"**Generated:** {report.generated_at.isoformat()}", "",
            "| Seller | Item Code | Description | Category | Qty | Remaining | Price |",
            "|--------|-----------|-------------|----------|-----|-----------|-------|",
        ]
        for item in report.items:
            lines.append(f"| {item.seller_code} | {item.item_code} | {item.description or ''} | "
                         f"{item.category or ''} | {item.quantity:G} | {item.remaining:G} | ${item.price:.2f} |")
    elif isinstance(report, TransactionsByUserReport):
        lines += [
            f"# Transactions by User: {report.event_name}",
            f"**Total:** {report.total_sales} sales · {report.total_voided} voided · ${report.gross_sales:.2f} gross  ",
            f"**Generated:** {report.generated_at.isoformat()}", "",
            "| Cashier | Sales | Voided | Gross | MYSL | Seller | Cash | Check | Card |",
            "|---------|-------|--------|-------|------|--------|------|-------|------|",
        ]
        for u in report.users:
            lines.append(
                f"| {u.cashier} | {u.sales_count} | {u.voided_count} | ${u.gross_sales:.2f} | "
                f"${u.mysl_total:.2f} | ${u.seller_total:.2f} | ${u.cash_total:.2f} | "
                f"${u.check_total:.2f} | ${u.cc_total:.2f} |")
        lines.append("")
        for u in report.users:
            lines.append(f"## {u.cashier}")
            lines.append("")
            lines.append("| Sale | Date | Items | Units | Total | MYSL | Seller | Cash | Check | Card | Voided |")
            lines.append("|------|------|-------|-------|-------|------|--------|------|-------|------|--------|")
            for t in u.transactions:
                when = t.date_of_sale.isoformat() if t.date_of_sale else "—"
                lines.append(
                    f"| #{t.sale_id} | {when} | {t.items_count} | {t.units_sold} | ${t.sale_total:.2f} | "
                    f"${t.mysl_total:.2f} | ${t.seller_total:.2f} | ${t.cash_amount:.2f} | "
                    f"${t.check_amount:.2f} | ${t.cc_amount:.2f} | {t.is_voided} |")
            lines.append("")
    elif isinstance(report, TransactionsByUserReport):
        pdf.cell(0, 8, _safe(f"Transactions by User: {report.event_name}"))
        pdf.ln()
        pdf.cell(0, 6, f"Generated: {report.generated_at.strftime('%Y-%m-%d %H:%M UTC')}")
        pdf.ln(6)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 6, "Per-User Summary", border="B")
        pdf.ln(8)
        pdf.set_font("Helvetica", "", 9)
        for hdr, width in [("Cashier", 40), ("Sales", 20), ("Voided", 20), ("Gross", 28),
                            ("MYSL", 24), ("Seller", 24), ("Cash", 20), ("Check", 18), ("Card", 16)]:
            pdf.cell(width, 6, hdr, border=1)
        pdf.ln()
        for u in report.users:
            pdf.cell(40, 6, _safe(u.cashier), border=1)
            pdf.cell(20, 6, u.sales_count, border=1)
            pdf.cell(20, 6, u.voided_count, border=1)
            pdf.cell(28, 6, f"${u.gross_sales:.2f}", border=1)
            pdf.cell(24, 6, f"${u.mysl_total:.2f}", border=1)
            pdf.cell(24, 6, f"${u.seller_total:.2f}", border=1)
            pdf.cell(20, 6, f"${u.cash_total:.2f}", border=1)
            pdf.cell(18, 6, f"${u.check_total:.2f}", border=1)
            pdf.cell(16, 6, f"${u.cc_total:.2f}", border=1)
            pdf.ln()

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
    """Sanitise ``text`` to Latin-1 for fpdf2 core font compatibility, replacing unencodable characters."""
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
        for hdr, width in [("Item Code", 26), ("Description", 42), ("Qty", 10),
                            ("Rem", 10), ("Price", 16), ("Sell", 16),
                            ("Status", 14), ("MYSL", 18), ("Seller", 18), ("Rate", 14)]:
            pdf.cell(width, 6, hdr, border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 9)
        for li in report.line_items:
            if pdf.get_y() > 260:
                pdf.add_page()
                pdf.set_font("Helvetica", "B", 10)
                for hdr, width in [("Item Code", 28), ("Description", 50), ("Price", 20),
                                    ("Sell", 20), ("Status", 20), ("MYSL", 22),
                                    ("Seller", 22), ("Rate", 18)]:
                    pdf.cell(width, 6, hdr, border=1)
                pdf.ln()
                pdf.set_font("Helvetica", "", 9)
            pdf.cell(26, 6, _safe(li.item_code), border=1)
            pdf.cell(42, 6, _safe((li.description or "")[:26]), border=1)
            pdf.cell(10, 6, f"{li.quantity:G}", border=1)
            pdf.cell(10, 6, f"{li.remaining:G}", border=1)
            pdf.cell(16, 6, f"${li.price:.2f}", border=1)
            pdf.cell(16, 6, f"${li.sell_price:.2f}", border=1)
            pdf.cell(14, 6, _safe(li.status), border=1)
            pdf.cell(18, 6, f"${li.mysl_share:.2f}", border=1)
            pdf.cell(18, 6, f"${li.seller_share:.2f}", border=1)
            pdf.cell(14, 6, f"{li.commission_rate:.0%}", border=1)
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
            pdf.cell(50, 6, _safe((item.description or "")[:32]), border=1)
            pdf.cell(12, 6, f"{item.quantity:G}", border=1)
            pdf.cell(12, 6, f"{item.remaining:G}", border=1)
            pdf.cell(20, 6, f"${item.price:.2f}", border=1)
            pdf.cell(25, 6, _safe(item.donation_type), border=1)
            pdf.ln()

    elif isinstance(report, UnsoldItemsReport):
        pdf.cell(0, 8, _safe(f"Unsold Items: {report.event_name}"))
        pdf.ln()
        pdf.cell(0, 6, f"Total Items: {report.total_items}  Total Value: ${report.total_value:.2f}")
        pdf.ln(6)
        pdf.set_font("Helvetica", "B", 10)
        for hdr, width in [("Seller", 25), ("Item Code", 28), ("Description", 44),
                            ("Category", 24), ("Qty", 10), ("Rem", 10), ("Price", 18)]:
            pdf.cell(width, 6, hdr, border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 9)
        for item in report.items:
            if pdf.get_y() > 260:
                pdf.add_page()
                pdf.set_font("Helvetica", "B", 10)
                for hdr, width in [("Seller", 25), ("Item Code", 28), ("Description", 44),
                                    ("Category", 24), ("Qty", 10), ("Rem", 10), ("Price", 18)]:
                    pdf.cell(width, 6, hdr, border=1)
                pdf.ln()
                pdf.set_font("Helvetica", "", 9)
            pdf.cell(25, 6, _safe(item.seller_code), border=1)
            pdf.cell(28, 6, _safe(item.item_code), border=1)
            pdf.cell(44, 6, _safe((item.description or "")[:28]), border=1)
            pdf.cell(24, 6, _safe(item.category or ""), border=1)
            pdf.cell(10, 6, f"{item.quantity:G}", border=1)
            pdf.cell(10, 6, f"{item.remaining:G}", border=1)
            pdf.cell(18, 6, f"${item.price:.2f}", border=1)
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
