"""Report serialisation service supporting JSON, CSV, Markdown, PDF, and XLSX output.

Converts a typed Pydantic report model into an HTTP ``Response`` in the
caller's requested format.  Each private helper handles one output format and
is dispatched by the public ``format_report`` entry point.
"""

import csv
import io

import openpyxl
import openpyxl.styles

from fastapi import HTTPException
from fastapi.responses import JSONResponse, Response
from fpdf import FPDF
from pydantic import BaseModel

from app.schemas.reports import (
    CheckTransactionsReport,
    CreditCardTransactionsReport,
    DonationsReport,
    SellersPayoutsReport,
    TransactionsByUserReport,
    EndOfDayReport,
    EventRevenueReport,
    NonVendorSalesWorkbook,
    SellerPayoutReport,
    UnsoldItemsReport,
    VendorEquipmentSummaryReport,
    VendorSalesWorkbook,
)

_VALID_FORMATS = {"json", "csv", "md", "pdf", "xlsx"}


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
    if fmt == "xlsx":
        return _to_xlsx(report, filename_base)
    return _to_pdf(report, filename_base)


def _to_csv(report: BaseModel, filename_base: str) -> Response:
    """Render a report as a downloadable CSV response."""
    out = io.StringIO()
    w = csv.writer(out)

    if isinstance(report, SellersPayoutsReport):
        w.writerow(["seller_code", "seller_name", "items_consigned", "items_sold",
                    "items_unsold", "items_donated", "gross_sales", "due_seller"])
        for p in report.sellers:
            w.writerow([p.seller_code, p.seller_name, p.items_consigned, p.items_sold,
                        p.items_unsold, p.items_donated, p.gross_sales,
                        p.seller_total])
        w.writerow(["TOTAL", "", report.seller_count, "",
                    "", "", report.gross_sales_total, report.seller_total])
    elif isinstance(report, SellerPayoutReport):
        info = report.seller_info
        w.writerow(["seller_code", "seller_name", "company", "is_vendor", "email", "phone",
                    "address", "city", "state", "zip", "commission_rate"])
        w.writerow([info.seller_code, info.seller_name, info.company, info.is_vendor,
                    info.email, info.phone, info.address, info.city, info.state,
                    info.zip, info.commission_rate])
        w.writerow([])
        w.writerow(["items_consigned", "items_sold", "items_unsold", "items_donated",
                    "gross_sales", "due_seller"])
        w.writerow([report.items_consigned, report.items_sold, report.items_unsold,
                    report.items_donated, report.gross_sales, report.seller_total])
        w.writerow([])
        w.writerow(["ITEMS", "item_code", "category", "brand", "description",
                    "size", "sell_price", "quantity", "remaining"])
        for it in report.items:
            w.writerow(["ITEMS", it.item_code, it.category, it.brand,
                        it.description, it.size, it.price, it.quantity, it.remaining])
        w.writerow([])
        w.writerow(["SALES DETAIL", "item_code", "category", "type", "brand", "description",
                    "quantity_sold", "sell_price", "extended_price", "price_adjustment_reason",
                    "due_seller", "commission_rate"])
        for s in report.sales:
            w.writerow(["SALES DETAIL", s.item_code, s.category, s.type, s.brand, s.description,
                        s.quantity_sold, s.sell_price, s.extended_price,
                        s.price_adjustment_reason, s.seller_share, s.commission_rate])
    elif isinstance(report, DonationsReport):
        w.writerow(["seller_code", "item_code", "description", "quantity", "remaining", "price", "donation_type"])
        for item in report.items:
            w.writerow([item.seller_code, item.item_code, item.description,
                        item.quantity, item.remaining, item.price, item.donation_type])
    elif isinstance(report, UnsoldItemsReport):
        w.writerow(["seller_code", "item_code", "description", "category", "quantity", "remaining", "price", "donate"])
        for item in report.items:
            w.writerow([item.seller_code, item.item_code, item.description,
                        item.category, item.quantity, item.remaining, item.price,
                        "Yes" if item.donate_unsold else "No"])
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
    elif isinstance(report, VendorEquipmentSummaryReport):
        w.writerow(["category", "items_consigned", "units_sold", "gross_sales",
                    "mysl_share", "seller_share", "units_unsold", "unsold_value"])
        for l in report.categories:
            w.writerow([l.category, l.items_consigned, l.units_sold, l.gross_sales,
                        l.mysl_share, l.seller_share, l.units_unsold, l.unsold_value])
        t = report.total
        w.writerow([t.category, t.items_consigned, t.units_sold, t.gross_sales,
                    t.mysl_share, t.seller_share, t.units_unsold, t.unsold_value])
    elif isinstance(report, VendorSalesWorkbook):
        # NonVendorSalesWorkbook subclasses this model; one flatten serves both.
        w.writerow(["seller_code", "item_code", "brand", "type", "category", "size",
                    "description", "qty_in", "price", "extend", "qty_sold",
                    "sell_price", "sell_extend", "due_seller", "unsold", "donate"])
        for b in report.vendors:
            for r in b.rows:
                w.writerow([r.seller_code, r.item_code, r.brand, r.type, r.category,
                            r.size, r.description, r.qty_in, r.price, r.extend,
                            r.qty_sold, r.sell_price, r.sell_extend, r.due_seller,
                            r.unsold, r.donate])
            w.writerow([b.vendor_name, "", "", "", "", "", "", "", "Totals:",
                        b.total_extend, "", "", b.total_sell_extend, b.total_due_seller,
                        b.total_unsold, b.total_donate])
    elif isinstance(report, CheckTransactionsReport):
        w.writerow(["sale_id", "date_of_sale", "cashier", "customer_name",
                    "check_number", "check_amount", "sale_total"])
        for t in report.transactions:
            w.writerow([t.sale_id, t.date_of_sale, t.cashier, t.customer_name,
                        t.check_number, t.check_amount, t.sale_total])
        w.writerow(["TOTALS", "", "", "", "", report.total_check_amount,
                    report.total_sale_amount])
    elif isinstance(report, CreditCardTransactionsReport):
        w.writerow(["sale_id", "transaction_number", "date_of_sale", "cashier",
                    "customer_name", "sale_total", "cc_recorded", "evidence", "notes"])
        for t in report.transactions:
            w.writerow([t.sale_id, t.transaction_number, t.date_of_sale, t.cashier,
                        t.customer_name, t.sale_total, t.cc_amount, t.evidence,
                        (t.notes or "").replace("\n", " ").replace("\r", " ")])
        w.writerow(["TOTALS", "", "", "", "",
                    report.total_sale_amount, report.confirmed_count + report.note_only_count + report.donation_only_count])
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

    if isinstance(report, SellersPayoutsReport):
        lines += [
            f"# Due Sellers: {report.event_name}",
            f"**Sellers:** {report.seller_count}  **Gross:** ${report.gross_sales_total:.2f}  "
            f"**Due Seller (all):** ${report.seller_total:.2f}  ",
            f"**Generated:** {report.generated_at.isoformat()}", "",
            "| Seller Code | Name | Consigned | Sold | Unsold | Donated | Gross | Due Seller |",
            "|-------------|------|-----------|------|--------|---------|-------|------------|",
        ]
        for p in report.sellers:
            lines.append(f"| {p.seller_code} | {p.seller_name} | {p.items_consigned} | {p.items_sold} | "
                         f"{p.items_unsold} | {p.items_donated} | ${p.gross_sales:.2f} | "
                         f"${p.seller_total:.2f} |")
    elif isinstance(report, SellerPayoutReport):
        info = report.seller_info
        contact = ", ".join(str(c) for c in [info.phone, info.email, info.address, info.city, info.state, info.zip] if c) or "—"
        lines += [
            f"# Due Seller: {report.seller_name} ({report.seller_code})",
            f"**Event:** {report.event_name}  ",
            f"**Generated:** {report.generated_at.isoformat()}  ",
            f"**Contact:** {contact}  ",
            f"**Type:** {'Vendor — ' + (info.company or '') if info.is_vendor else 'Individual'}  "
            f"(commission {info.commission_rate:.0%})",
            "",
            "## Summary",
            "| Consigned | Sold | Unsold | Donated | Gross Sales | Due Seller |",
            "|-----------|------|--------|---------|-------------|------------|",
            f"| {report.items_consigned} | {report.items_sold} | {report.items_unsold} | "
            f"{report.items_donated} | ${report.gross_sales:.2f} | "
            f"${report.seller_total:.2f} |",
            "",
            "## Items",
            "| Item Code | Category | Brand | Description | Size | Sell Price | Quantity | Remaining |",
            "|-----------|----------|-------|-------------|------|------------|----------|-----------|",
        ]
        for it in report.items:
            lines.append(f"| {it.item_code} | {it.category or ''} | {it.brand or ''} | "
                         f"{it.description or ''} | {it.size or ''} | ${it.price:.2f} | "
                         f"{it.quantity:G} | {it.remaining:G} |")
        lines += ["", "## Sales Detail",
            "| Item Code | Category | Type | Brand | Description | Qty | Sell Price | Extended | Adj. Reason | Due Seller | Rate |",
            "|-----------|----------|------|-------|-------------|-----|------------|----------|-------------|------------|------|",
        ]
        for s in report.sales:
            lines.append(f"| {s.item_code} | {s.category or ''} | "
                         f"{s.type or ''} | {s.brand or ''} | {s.description or ''} | "
                         f"{s.quantity_sold:G} | "
                         f"${s.sell_price:.2f} | ${s.extended_price:.2f} | "
                         f"{s.price_adjustment_reason or ''} | "
                         f"${s.seller_share:.2f} | {s.commission_rate:.0%} |")
    elif isinstance(report, VendorEquipmentSummaryReport):
        lines += [
            f"# Vendor Equipment Summary: {report.seller_name} ({report.seller_code})",
            f"**Event:** {report.event_name}  ",
            f"**Vendor commission:** {report.vendor_commission_rate:.0%}  ",
            f"**Generated:** {report.generated_at.isoformat()}", "",
            "| Category | Consigned | Units Sold | Gross | MYSL | Vendor Payout | Unsold Units | Unsold Value |",
            "|----------|-----------|------------|-------|------|---------------|--------------|--------------|",
        ]
        for l in report.categories:
            lines.append(f"| {l.category} | {l.items_consigned} | {l.units_sold:G} | ${l.gross_sales:.2f} | "
                         f"${l.mysl_share:.2f} | ${l.seller_share:.2f} | {l.units_unsold:G} | ${l.unsold_value:.2f} |")
        t = report.total
        lines.append(f"| **TOTAL** | {t.items_consigned} | {t.units_sold:G} | ${t.gross_sales:.2f} | "
                     f"${t.mysl_share:.2f} | ${t.seller_share:.2f} | {t.units_unsold:G} | ${t.unsold_value:.2f} |")
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
        if report.exempt_lines_total:
            codes = ", ".join(report.exempt_seller_codes) or "(exempt sellers)"
            lines.append(
                f"| {codes} (exempt) | ${report.exempt_lines_total:.2f} |"
            )
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
            "| Seller | Item Code | Description | Category | Qty | Remaining | Price | Donate |",
            "|--------|-----------|-------------|----------|-----|-----------|-------|--------|",
        ]
        for item in report.items:
            lines.append(f"| {item.seller_code} | {item.item_code} | {item.description or ''} | "
                         f"{item.category or ''} | {item.quantity:G} | {item.remaining:G} | ${item.price:.2f} | "
                         f"{'Yes' if item.donate_unsold else 'No'} |")
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
        if report.exempt_lines_total:
            lines.append(
                f"| Exempt-seller sales (full payout, no commission) | ${report.exempt_lines_total:.2f} |"
            )

    elif isinstance(report, VendorSalesWorkbook):
        # NonVendorSalesWorkbook subclasses this model; one flatten serves both.
        title = "Non-Vendor Sales" if isinstance(report, NonVendorSalesWorkbook) else "Vendor Sales"
        lines += [
            f"# {title}: {report.event_name}",
            f"**Commission rate:** {report.commission_rate:.0%}  ",
            f"**Generated:** {report.generated_at.isoformat()}", "",
        ]
        for b in report.vendors:
            lines += [
                f"## {b.vendor_name}", "",
                "| Seller Code | Item ID | Brand | Type | Category | Size | Description | "
                "Qty. In | Price | Extend | Qty. Sold | Sell Price | Sell Extend | Due Seller | Unsold | Donate |",
                "|------|--------|-------|------|----------|------|-------------|"
                "--------|-------|--------|-----------|------------|-------------|-----------|--------|--------|",
            ]
            for r in b.rows:
                lines.append(
                    f"| {r.seller_code} | {r.item_code} | {r.brand or ''} | {r.type or ''} | "
                    f"{r.category or ''} | {r.size or ''} | {r.description or ''} | "
                    f"{r.qty_in:G} | ${r.price:.2f} | ${r.extend:.2f} | {r.qty_sold:G} | "
                    f"${r.sell_price:.2f} | ${r.sell_extend:.2f} | ${r.due_seller:.2f} | "
                    f"${r.unsold:.2f} | ${r.donate:.2f} |")
            lines.append(
                f"| **{b.vendor_name}** | | | | | | | | **Totals:** | "
                f"${b.total_extend:.2f} | | | ${b.total_sell_extend:.2f} | "
                f"${b.total_due_seller:.2f} | ${b.total_unsold:.2f} | ${b.total_donate:.2f} |")
            lines.append("")
        lines.append(f"**Commission rate applied:** {report.commission_rate:.0%}")

    elif isinstance(report, CheckTransactionsReport):
        when = lambda t: t.date_of_sale.strftime("%Y-%m-%d %H:%M") if t.date_of_sale else "—"
        lines += [
            f"# Check Transactions: {report.event_name}",
            f"**Transactions:** {report.count}  **Total checks:** ${report.total_check_amount:.2f}  "
            f"**Total sale amount:** ${report.total_sale_amount:.2f}  ",
            f"**Generated:** {report.generated_at.isoformat()}", "",
            "| Sale | Date | Cashier | Customer | Check # | Check Amount | Sale Total |",
            "|------|------|---------|----------|---------|--------------|------------|",
        ]
        for t in report.transactions:
            lines.append(
                f"| #{t.sale_id} | {when(t)} | {t.cashier} | {t.customer_name or ''} | "
                f"{t.check_number or ''} | ${t.check_amount:.2f} | ${t.sale_total:.2f} |")
        lines.append(
            f"| **TOTAL** | | | | | **${report.total_check_amount:.2f}** | "
            f"**${report.total_sale_amount:.2f}** |")

    elif isinstance(report, CreditCardTransactionsReport):
        when = lambda t: t.date_of_sale.strftime("%Y-%m-%d %H:%M") if t.date_of_sale else "\u2014"
        lines += [
            f"# Credit Card Transactions: {report.event_name}",
            f"**Transactions:** {report.count}  **Total sale amount:** ${report.total_sale_amount:.2f}  ",
            f"**Confirmed (donation+note):** {report.confirmed_count} (${report.confirmed_total:.2f})  "
            f"**Note-only:** {report.note_only_count} (${report.note_only_total:.2f})  "
            f"**Donation-only:** {report.donation_only_count} (${report.donation_only_total:.2f})",
            f"**Generated:** {report.generated_at.isoformat()}", "",
            "| Sale | Txn # | Date | Cashier | Customer | Sale Total | Evidence | Notes |",
            "|------|-------|------|---------|----------|------------|----------|-------|",
        ]
        for t in report.transactions:
            lines.append(
                f"| #{t.sale_id} | {t.transaction_number or ''} | {when(t)} | {t.cashier} | "
                f"{(t.customer_name or '')[:20]} | ${t.sale_total:.2f} | {t.evidence} | "
                f"{(t.notes or '').replace(chr(10), ' ').replace(chr(13), ' ')} |")
        lines.append("")
        lines.append("Note-only rows flagged a CC charge in notes without a 10043 donation line; "
                     "donation-only rows carry the 10043 line without a CC note.")

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

    if isinstance(report, SellersPayoutsReport):
        pdf.cell(0, 8, _safe(f"Due Sellers: {report.event_name}"))
        pdf.ln()
        pdf.cell(0, 6, f"Sellers: {report.seller_count}  Gross: ${report.gross_sales_total:.2f}  "
                       f"Due Seller (all): ${report.seller_total:.2f}")
        pdf.ln()
        pdf.cell(0, 6, f"Generated: {report.generated_at.strftime('%Y-%m-%d %H:%M UTC')}")
        pdf.ln(8)
        pdf.set_font("Helvetica", "B", 10)
        for hdr, width in [("Seller Code", 28), ("Name", 45), ("Consigned", 22), ("Sold", 16),
                            ("Unsold", 16), ("Donated", 16), ("Gross", 22), ("Due Seller", 22)]:
            pdf.cell(width, 6, hdr, border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 9)
        for p in report.sellers:
            if pdf.get_y() > 260:
                pdf.add_page()
                pdf.set_font("Helvetica", "B", 10)
                for hdr, width in [("Seller Code", 28), ("Name", 45), ("Consigned", 22), ("Sold", 16),
                                    ("Unsold", 16), ("Donated", 16), ("Gross", 22), ("Due Seller", 22)]:
                    pdf.cell(width, 6, hdr, border=1)
                pdf.ln()
                pdf.set_font("Helvetica", "", 9)
            pdf.cell(28, 6, _safe(p.seller_code), border=1)
            pdf.cell(45, 6, _safe(p.seller_name[:32]), border=1)
            pdf.cell(22, 6, str(p.items_consigned), border=1)
            pdf.cell(16, 6, str(p.items_sold), border=1)
            pdf.cell(16, 6, str(p.items_unsold), border=1)
            pdf.cell(16, 6, str(p.items_donated), border=1)
            pdf.cell(22, 6, f"${p.gross_sales:.2f}", border=1)
            pdf.cell(22, 6, f"${p.seller_total:.2f}", border=1)
            pdf.ln()
        pdf.ln(6)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 6, f"Grand totals — Gross: ${report.gross_sales_total:.2f}  "
                       f"Due Seller (all): ${report.seller_total:.2f}")
        pdf.ln()

    elif isinstance(report, SellerPayoutReport):
        info = report.seller_info
        contact = ", ".join(str(c) for c in [info.phone, info.email, info.address, info.city, info.state, info.zip] if c)
        pdf.cell(0, 8, _safe(f"Due Seller: {report.seller_name} ({report.seller_code})"))
        pdf.ln()
        pdf.cell(0, 6, _safe(f"Event: {report.event_name}"))
        pdf.ln()
        pdf.cell(0, 6, _safe(f"Contact: {contact or '—'}"))
        pdf.ln()
        pdf.cell(0, 6, _safe(f"Type: {'Vendor — ' + (info.company or '') if info.is_vendor else 'Individual'} "
                             f"(commission {info.commission_rate:.0%})"))
        pdf.ln()
        pdf.cell(0, 6, f"Generated: {report.generated_at.strftime('%Y-%m-%d %H:%M UTC')}")
        pdf.ln(8)
        pdf.set_font("Helvetica", "B", 10)
        for hdr in ["Gross Sales", "Due Seller"]:
            pdf.cell(45, 6, hdr, border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 10)
        for val in [f"${report.gross_sales:.2f}", f"${report.seller_total:.2f}"]:
            pdf.cell(45, 6, val, border=1)
        pdf.ln(10)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 6, "Items")
        pdf.ln(6)
        # Single item list in the intake-worksheet layout + Item Code, with
        # original/remaining quantity columns — replaces the old Sales/Unsold
        # split's Unsold table (sold rows carry remaining 0).
        items_cols = [("Item Code", 18), ("Category", 20), ("Brand", 20),
                      ("Description", 42), ("Size", 14), ("Sell", 14),
                      ("Qty", 9), ("Rem", 9)]

        def _items_row(cells: list[str], bold: bool = False) -> None:
            if pdf.get_y() > 260:
                pdf.add_page()
                _items_row([hdr for hdr, _ in items_cols], bold=True)
            pdf.set_font("Helvetica", "B" if bold else "", 10 if bold else 9)
            for text, (_, width) in zip(cells, items_cols):
                pdf.cell(width, 6, text, border=1)
            pdf.ln()

        _items_row([hdr for hdr, _ in items_cols], bold=True)
        for it in report.items:
            _items_row([
                _safe(it.item_code),
                _safe((it.category or "")[:14]),
                _safe((it.brand or "")[:14]),
                _safe((it.description or "")[:26]),
                _safe((it.size or "")[:10]),
                f"${it.price:.2f}",
                f"{it.quantity:G}",
                f"{it.remaining:G}",
            ])
        pdf.ln(8)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 6, "Sales Detail")
        pdf.ln(6)
        # Shared column geometry: headers, data rows and page-break headers all
        # render through the same width list, so they can never drift apart.
        # Total width must stay within the printable page width (190mm on A4):
        # 18+26+20+16+18+8+14+14+26+18+10 = 188mm. Category/Type/Brand replace
        # the old Date column (fpdf cell() does NOT truncate — clip in code).
        sales_cols = [("Item Code", 18), ("Category", 20), ("Type", 16),
                      ("Brand", 18), ("Description", 26), ("Qty", 8),
                      ("Sell", 14), ("Total", 14), ("Adj. Reason", 26),
                      ("Due Seller", 18), ("Rate", 10)]

        def _pdf_row(cells: list[str], bold: bool = False) -> None:
            if pdf.get_y() > 260:
                pdf.add_page()
                _pdf_row([hdr for hdr, _ in sales_cols], bold=True)
            pdf.set_font("Helvetica", "B" if bold else "", 10 if bold else 9)
            for text, (_, width) in zip(cells, sales_cols):
                pdf.cell(width, 6, text, border=1)
            pdf.ln()

        _pdf_row([hdr for hdr, _ in sales_cols], bold=True)
        for s in report.sales:
            _pdf_row([
                _safe(s.item_code),
                _safe((s.category or "")[:12]),
                _safe((s.type or "")[:9]),
                _safe((s.brand or "")[:11]),
                _safe((s.description or "")[:17]),
                f"{s.quantity_sold:G}",
                f"${s.sell_price:.2f}",
                f"${s.extended_price:.2f}",
                _safe((s.price_adjustment_reason or "")[:17]),
                f"${s.seller_share:.2f}",
                f"{s.commission_rate:.0%}",
            ])

    elif isinstance(report, VendorSalesWorkbook):
        # NonVendorSalesWorkbook subclasses this model; one table serves both.
        title = "Non-Vendor Sales" if isinstance(report, NonVendorSalesWorkbook) else "Vendor Sales"
        pdf.cell(0, 8, _safe(f"{title}: {report.event_name}  (commission {report.commission_rate:.0%})"))
        pdf.ln(8)
        # 16 columns; widths sum to exactly 190mm (printable A4 width).
        wb_cols = [("Seller", 16), ("Item", 14), ("Brand", 16), ("Type", 12),
                   ("Category", 14), ("Size", 10), ("Desc", 26), ("Qty In", 10),
                   ("Price", 10), ("Extend", 10), ("Sold", 10), ("Sell $", 10),
                   ("Sell Ext", 10), ("Due", 12), ("Unsold", 10), ("Donate", 10)]

        def _wb_row(cells: list[str], bold: bool = False) -> None:
            if pdf.get_y() > 260:
                pdf.add_page()
                _wb_row([hdr for hdr, _ in wb_cols], bold=True)
            pdf.set_font("Helvetica", "B" if bold else "", 9)
            for text, (_, width) in zip(cells, wb_cols):
                pdf.cell(width, 6, text, border=1)
            pdf.ln()

        for b in report.vendors:
            _wb_row([hdr for hdr, _ in wb_cols], bold=True)
            for r in b.rows:
                _wb_row([
                    _safe(r.seller_code), _safe(r.item_code),
                    _safe((r.brand or "")[:10]), _safe((r.type or "")[:7]),
                    _safe((r.category or "")[:9]), _safe((r.size or "")[:6]),
                    _safe((r.description or "")[:16]),
                    f"{r.qty_in:G}", f"${r.price:.2f}", f"${r.extend:.2f}",
                    f"{r.qty_sold:G}", f"${r.sell_price:.2f}", f"${r.sell_extend:.2f}",
                    f"${r.due_seller:.2f}", f"${r.unsold:.2f}", f"${r.donate:.2f}",
                ])
            _wb_row([
                _safe(b.vendor_name[:10]), "", "", "", "", "", "", "", "Totals:",
                f"${b.total_extend:.2f}", "", "", f"${b.total_sell_extend:.2f}",
                f"${b.total_due_seller:.2f}", f"${b.total_unsold:.2f}", f"${b.total_donate:.2f}",
            ], bold=True)
            pdf.ln(2)

    elif isinstance(report, CheckTransactionsReport):
        pdf.cell(0, 8, _safe(f"Check Transactions: {report.event_name}"))
        pdf.ln()
        pdf.cell(0, 6, f"{report.count} transactions  Total checks: ${report.total_check_amount:.2f}  "
                        f"Total sale amount: ${report.total_sale_amount:.2f}")
        pdf.ln(8)
        # Widths sum to exactly 190mm (printable A4 width).
        ck_cols = [("Sale", 16), ("Date/Time", 34), ("Cashier", 28),
                   ("Customer", 40), ("Check #", 20), ("Check $", 26), ("Total", 26)]

        def _ck_row(cells: list[str], bold: bool = False) -> None:
            if pdf.get_y() > 260:
                pdf.add_page()
                _ck_row([hdr for hdr, _ in ck_cols], bold=True)
            pdf.set_font("Helvetica", "B" if bold else "", 10 if bold else 9)
            for text, (_, width) in zip(cells, ck_cols):
                pdf.cell(width, 6, text, border=1)
            pdf.ln()

        _ck_row([hdr for hdr, _ in ck_cols], bold=True)
        for t in report.transactions:
            when = t.date_of_sale.strftime("%Y-%m-%d %H:%M") if t.date_of_sale else "—"
            _ck_row([
                f"#{t.sale_id}",
                _safe(when),
                _safe(t.cashier[:16]),
                _safe((t.customer_name or "")[:24]),
                _safe((t.check_number or "")[:12]),
                f"${t.check_amount:.2f}",
                f"${t.sale_total:.2f}",
            ])
        _ck_row([
            "TOTAL", "", "", "", "",
            f"${report.total_check_amount:.2f}",
            f"${report.total_sale_amount:.2f}",
        ], bold=True)

    elif isinstance(report, CreditCardTransactionsReport):
        pdf.cell(0, 8, _safe(f"Credit Card Transactions: {report.event_name}"))
        pdf.ln()
        pdf.cell(0, 6, f"{report.count} transactions  Total sale amount: ${report.total_sale_amount:.2f}  "
                       f"Confirmed: {report.confirmed_count}  Note-only: {report.note_only_count}  "
                       f"Donation-only: {report.donation_only_count}")
        pdf.ln(8)
        # Widths sum to exactly 190mm (printable A4 width).
        cc_cols = [("Sale", 14), ("Txn#", 12), ("Date/Time", 30), ("Cashier", 24),
                   ("Sale Total", 22), ("Evidence", 26), ("Notes", 62)]

        def _cc_row(cells, bold: bool = False) -> None:
            if pdf.get_y() > 260:
                pdf.add_page()
                _cc_row([hdr for hdr, _ in cc_cols], bold=True)
            pdf.set_font("Helvetica", "B" if bold else "", 10 if bold else 9)
            for text, (_, width) in zip(cells, cc_cols):
                pdf.cell(width, 6, text, border=1)
            pdf.ln()

        _cc_row([hdr for hdr, _ in cc_cols], bold=True)
        for t in report.transactions:
            when = t.date_of_sale.strftime("%Y-%m-%d %H:%M") if t.date_of_sale else "\u2014"
            flattened = (t.notes or "").replace("\n", " ").replace("\r", " ")
            _cc_row([
                f"#{t.sale_id}",
                _safe(str(t.transaction_number or "")),
                _safe(when),
                _safe(t.cashier[:16]),
                f"${t.sale_total:.2f}",
                _safe(t.evidence),
                _safe(flattened[:60]),
            ])
        _cc_row([
            "TOTAL", "", "", "",
            f"${report.total_sale_amount:.2f}", "", ""
        ], bold=True)

    elif isinstance(report, VendorEquipmentSummaryReport):
        pdf.cell(0, 8, _safe(f"Vendor Equipment Summary: {report.seller_name} ({report.seller_code})"))
        pdf.ln()
        pdf.cell(0, 6, _safe(f"Event: {report.event_name}   Vendor commission: {report.vendor_commission_rate:.0%}"))
        pdf.ln(6)
        # Shared (header, width) geometry; total 178mm <= 190mm printable width.
        vendor_cols = [("Category", 40), ("Consigned", 20), ("Sold", 16), ("Gross", 22),
                       ("MYSL", 20), ("Vendor", 20), ("Unsold", 16), ("Unsold $", 24)]

        def _vendor_row(cells: list[str], bold: bool = False) -> None:
            if pdf.get_y() > 260:
                pdf.add_page()
                _vendor_row([hdr for hdr, _ in vendor_cols], bold=True)
            pdf.set_font("Helvetica", "B" if bold else "", 9)
            for text, (_, width) in zip(cells, vendor_cols):
                pdf.cell(width, 6, text, border=1)
            pdf.ln()

        _vendor_row([hdr for hdr, _ in vendor_cols], bold=True)
        for l in report.categories:
            _vendor_row([
                _safe(l.category[:24]),
                str(l.items_consigned),
                f"{l.units_sold:G}",
                f"${l.gross_sales:.2f}",
                f"${l.mysl_share:.2f}",
                f"${l.seller_share:.2f}",
                f"{l.units_unsold:G}",
                f"${l.unsold_value:.2f}",
            ])
        t = report.total
        _vendor_row([
            "TOTAL",
            str(t.items_consigned),
            f"{t.units_sold:G}",
            f"${t.gross_sales:.2f}",
            f"${t.mysl_share:.2f}",
            f"${t.seller_share:.2f}",
            f"{t.units_unsold:G}",
            f"${t.unsold_value:.2f}",
        ], bold=True)
        pdf.ln(6)
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
            ("Exempt-seller sales", f"${report.exempt_lines_total:.2f}"),
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
                            ("Category", 24), ("Qty", 10), ("Rem", 10), ("Price", 18),
                            ("Donate", 14)]:
            pdf.cell(width, 6, hdr, border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 9)
        for item in report.items:
            if pdf.get_y() > 260:
                pdf.add_page()
                pdf.set_font("Helvetica", "B", 10)
                for hdr, width in [("Seller", 25), ("Item Code", 28), ("Description", 44),
                                    ("Category", 24), ("Qty", 10), ("Rem", 10), ("Price", 18),
                                    ("Donate", 14)]:
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
            pdf.cell(14, 6, "Yes" if item.donate_unsold else "No", border=1)
            pdf.ln()

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
            pdf.cell(20, 6, str(u.sales_count), border=1)
            pdf.cell(20, 6, str(u.voided_count), border=1)
            pdf.cell(28, 6, f"${u.gross_sales:.2f}", border=1)
            pdf.cell(24, 6, f"${u.mysl_total:.2f}", border=1)
            pdf.cell(24, 6, f"${u.seller_total:.2f}", border=1)
            pdf.cell(20, 6, f"${u.cash_total:.2f}", border=1)
            pdf.cell(18, 6, f"${u.check_total:.2f}", border=1)
            pdf.cell(16, 6, f"${u.cc_total:.2f}", border=1)
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
            ("Exempt-seller sales", f"${report.exempt_lines_total:.2f}"),
        ]:
            pdf.cell(80, 7, label, border=1)
            pdf.cell(40, 7, value, border=1)
            pdf.ln()

    return Response(
        content=bytes(pdf.output()),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename_base}.pdf"'},
    )


def _vendor_sales_xlsx_bytes(report: VendorSalesWorkbook, sheet_name: str = "Retailer_Sales") -> bytes:
    """Build a consolidated sales workbook (legacy 'Retailer_Sales' layout).

    Shared by the vendor workbook (sheet 'Retailer_Sales') and its
    non-vendor counterpart (sheet 'NonVendor_Sales') — identical 16-column
    block layout. One block per seller: a header row, one row per item, a
    Totals row (col I = 'Totals:', col A = seller display name, values in
    J Extend / M Sell Extend / N Due Seller / O Unsold / P Donate — exactly
    like the 2025 sheet), then a fully blank separator row. Exempt sellers
    (league merchandise) come last, mirroring the 2025 layout.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    if ws is None:
        raise ValueError("Workbook has no active sheet")
    ws.title = sheet_name

    _HEADER = [
        "Seller Code", "Item ID", "Brand", "Type", "Category", "Size",
        "Description", "Qty. In", "Price", "Extend", "Qty. Sold",
        "Sell Price", "Sell Extend", "Due Seller", "Unsold", "Donate",
    ]
    for col, cell in zip("ABCDEFGHIJKLMNOP", _HEADER):
        header_cell = ws[f"{col}1"]
        header_cell.value = cell
        header_cell.font = openpyxl.styles.Font(bold=True)

    row = 2
    for vi, block in enumerate(report.vendors):
        if vi > 0:
            row += 1  # blank separator row between vendor blocks
        for r in block.rows:
            ws.cell(row=row, column=1, value=r.seller_code)
            ws.cell(row=row, column=2, value=r.item_code)
            ws.cell(row=row, column=3, value=r.brand)
            ws.cell(row=row, column=4, value=r.type)
            ws.cell(row=row, column=5, value=r.category)
            ws.cell(row=row, column=6, value=r.size)
            ws.cell(row=row, column=7, value=r.description)
            ws.cell(row=row, column=8, value=r.qty_in)
            ws.cell(row=row, column=9, value=r.price)
            ws.cell(row=row, column=10, value=r.extend)
            ws.cell(row=row, column=11, value=r.qty_sold)
            ws.cell(row=row, column=12, value=r.sell_price)
            ws.cell(row=row, column=13, value=r.sell_extend)
            ws.cell(row=row, column=14, value=r.due_seller)
            ws.cell(row=row, column=15, value=r.unsold)
            ws.cell(row=row, column=16, value=r.donate)
            row += 1
        # Totals row: vendor name in col A, 'Totals:' in col I, sums in the
        # value columns the 2025 sheet used (J/M/N/O/P) — Qty. Sold (K) and
        # Sell Price (L) intentionally blank units/averages don't sum.
        ws.cell(row=row, column=1, value=block.vendor_name)
        ws.cell(row=row, column=9, value="Totals:")
        ws.cell(row=row, column=10, value=block.total_extend)
        ws.cell(row=row, column=13, value=block.total_sell_extend)
        ws.cell(row=row, column=14, value=block.total_due_seller)
        ws.cell(row=row, column=15, value=block.total_unsold)
        ws.cell(row=row, column=16, value=block.total_donate)
        for col in (1, 9):
            ws.cell(row=row, column=col).font = openpyxl.styles.Font(bold=True)
        row += 1

    # Column widths approximating the legacy sheet so it prints readably.
    widths = {"A": 12, "B": 10, "C": 16, "D": 10, "E": 12, "F": 10,
              "G": 34, "H": 8, "I": 8, "J": 10, "K": 10, "L": 10,
              "M": 12, "N": 11, "O": 10, "P": 8}
    for col, width in widths.items():
        ws.column_dimensions[col].width = width

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


def _payout_xlsx_bytes(report: SellerPayoutReport) -> bytes:
    """Build an Excel workbook for one seller's payout.

    Sheets: "Summary" (seller contact information + totals), "Items" (the
    single consigned-items list in the intake worksheet layout + Item Code,
    with original/remaining quantity columns) and "Sales Detail" (every
    non-voided sale line with prices and commission shares).
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    if ws is None:
        raise ValueError("Workbook has no active sheet")
    ws.title = "Summary"
    info = report.seller_info
    ws.append(["Due Seller", report.seller_name, f"({report.seller_code})"])
    ws.append([])
    ws.append(["Event", report.event_name])
    ws.append(["Generated", report.generated_at.strftime("%Y-%m-%d %H:%M UTC")])
    ws.append(["Type", "Vendor — " + (info.company or "") if info.is_vendor else "Individual"])
    ws.append(["Commission rate", info.commission_rate])
    ws.append([])
    for label, value in [
        ("Phone", info.phone), ("Email", info.email), ("Address", info.address),
        ("City", info.city), ("State", info.state), ("ZIP", info.zip),
    ]:
        if value:
            ws.append([label, value])
    ws.append([])
    ws.append(["Items Consigned", report.items_consigned])
    ws.append(["Items Sold", report.items_sold])
    ws.append(["Items Unsold", report.items_unsold])
    ws.append(["Items Donated", report.items_donated])
    ws.append(["Gross Sales", report.gross_sales])
    ws.append(["Due Seller", report.seller_total])

    ws_items = wb.create_sheet("Items")
    ws_items.append(["Item Code", "Category", "Brand", "Description", "Size",
                     "Sell Price", "Quantity", "Remaining"])
    for it in report.items:
        ws_items.append([it.item_code, it.category, it.brand, it.description,
                         it.size, it.price, it.quantity, it.remaining])
    ws_items.append([])
    ws_items.append(["Items consigned", len(report.items)])

    ws_sales = wb.create_sheet("Sales Detail")
    # Column order mirrors the Items sheet (Item Code, Category, Brand,
    # Description); Type rides beside Category. Date column dropped 2026-11-23.
    ws_sales.append(["Item Code", "Category", "Type", "Brand", "Description",
                     "Qty", "Sell Price", "Extended", "Adj. Reason",
                     "Due Seller", "Rate"])
    for s in report.sales:
        ws_sales.append([s.item_code, s.category, s.type, s.brand, s.description,
                         s.quantity_sold, s.sell_price, s.extended_price,
                         s.price_adjustment_reason, s.seller_share, s.commission_rate])
    ws_sales.append([])
    # Sales Total: gross under Extended (col 8), seller under Due Seller (col 10).
    ws_sales.append(["Sales Total", "", "", "", "", "", "",
                     round(report.gross_sales, 2), "",
                     round(report.seller_total, 2)])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


def _to_xlsx(report: BaseModel, filename_base: str) -> Response:
    """Render a report as a downloadable Excel (xlsx) response.

    SellerPayoutReport gets a three-sheet workbook (Summary / Sales /
    Unsold Items); other report types fall back to a single-sheet
    header + values dump (mirroring the generic CSV branch).
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    if ws is None:
        raise HTTPException(status_code=500, detail="Workbook has no active sheet")

    if isinstance(report, SellerPayoutReport):
        content = _payout_xlsx_bytes(report)
    elif isinstance(report, NonVendorSalesWorkbook):
        content = _vendor_sales_xlsx_bytes(report, sheet_name="NonVendor_Sales")
    elif isinstance(report, VendorSalesWorkbook):
        content = _vendor_sales_xlsx_bytes(report)
    elif isinstance(report, VendorEquipmentSummaryReport):
        ws.append(["Vendor Equipment Summary"])
        ws.append(["Vendor", f"{report.seller_name} ({report.seller_code})"])
        ws.append(["Event", report.event_name])
        ws.append(["Vendor commission", report.vendor_commission_rate])
        ws.append([])
        ws.append(["Category", "Consigned", "Units Sold", "Gross", "MYSL",
                   "Vendor Payout", "Unsold Units", "Unsold $"])
        for l in report.categories:
            ws.append([l.category, l.items_consigned, l.units_sold, l.gross_sales,
                       l.mysl_share, l.seller_share, l.units_unsold, l.unsold_value])
        t = report.total
        ws.append([t.category, t.items_consigned, t.units_sold, t.gross_sales,
                   t.mysl_share, t.seller_share, t.units_unsold, t.unsold_value])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        content = buf.getvalue()
    else:
        data = report.model_dump(mode="json")
        ws.append(list(data.keys()))
        ws.append([str(v) for v in data.values()])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        content = buf.getvalue()

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename_base}.xlsx"'},
    )
