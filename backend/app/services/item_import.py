"""Bulk item import service — parses an uploaded template file (Excel .xlsx, CSV,
or TSV) and creates item rows for an intake, applying brand closest-matching and
collecting per-row errors.

Columns (12): Description, Category, Brand, Type, Color, Size, Gender/Age, Year,
Price, Used, Donate if Unsold, Quantity. Rows from an older 11-column template
(without Quantity) are accepted — quantity defaults to 1. Price is rounded UP
to the nearest whole dollar (whole-dollar pricing decision).

Semantics: every row is validated; valid rows are committed in a single
transaction and invalid rows are reported back in an error list (the caller can
render/download the error report). Brand values are replaced with the closest
existing brand (normalized edit distance ≤ 2) when a close match exists.
Category and Type are case-insensitively normalized to the canonical casing
(never rejected); Quantity defaults to 1 when blank.
"""

import csv
import io
import math
from io import BytesIO
from typing import Any

import openpyxl
from sqlalchemy.orm import Session

from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller
from app.schemas.item import ImportResult, ImportRowError
from app.services.brand_match import closest_brand
from app.services.canonical import canonicalize_category, canonicalize_type


def parse_upload(filename: str, data: bytes) -> list[list[Any]]:
    """Parse an uploaded template file into a list of data rows (no header).

    Detects format by extension: .xlsx via openpyxl, .csv/.tsv via the stdlib
    csv module (delimiter sniffed). Raises ValueError for unsupported formats or
    unreadable files.
    """
    name = (filename or "").lower()
    if name.endswith(".xlsx"):
        try:
            wb = openpyxl.load_workbook(BytesIO(data))
        except Exception as exc:  # noqa: BLE001 - surface as a single 422
            raise ValueError("Invalid or unreadable xlsx file") from exc
        return list(wb.active.iter_rows(min_row=2, values_only=True))
    if name.endswith(".csv") or name.endswith(".tsv"):
        delimiter = "\t" if name.endswith(".tsv") else ","
        text = data.decode("utf-8-sig", errors="replace")
        reader = csv.reader(io.StringIO(text), delimiter=delimiter)
        rows = list(reader)
        return rows[1:]  # drop header
    # Unknown extension: try CSV as a forgiving fallback, else xlsx bytes.
    try:
        text = data.decode("utf-8-sig", errors="replace")
        rows = list(csv.reader(io.StringIO(text)))
        return rows[1:]
    except Exception as exc:  # noqa: BLE001
        raise ValueError("Unsupported import format (use .xlsx, .csv, or .tsv)") from exc


def _existing_brands(db: Session, seller: Seller) -> list[str]:
    """Distinct brand strings already used by this seller's event (for matching)."""
    rows = (
        db.query(Item.brand)
        .join(Intake, Item.intake_id == Intake.id)
        .join(Seller, Intake.seller_id == Seller.id)
        .filter(Seller.event_id == seller.event_id, Item.brand.isnot(None))
        .distinct()
        .all()
    )
    return [r[0] for r in rows if r[0]]


def import_items(
    db: Session,
    intake: Intake,
    seller: Seller,
    username: str,
    filename: str,
    data: bytes,
) -> ImportResult:
    """Import items from an uploaded template into the given intake session."""
    try:
        rows = parse_upload(filename, data)
    except ValueError as exc:
        raise exc

    brands_pool = _existing_brands(db, seller)

    prefix = f"{seller.code}-"
    existing_codes = (
        db.query(Item.code)
        .join(Intake, Item.intake_id == Intake.id)
        .filter(Intake.seller_id == seller.id, Item.code.like(f"{prefix}%"))
        .all()
    )
    next_seq = max((int(r[0].rsplit("-", 1)[-1]) for r in existing_codes), default=0) + 1

    errors: list[ImportRowError] = []
    imported = 0
    skipped = 0

    for i, row in enumerate(rows, start=2):  # row 1 is the header
        padded = (list(row) + [None] * 12)[:12]
        (
            description, category, brand, type_, color, size, gender_age,
            year, price, used_str, donate_str, quantity_val,
        ) = padded

        if not description or price is None:
            errors.append(ImportRowError(row=i, reason="Missing required field: Description or Price"))
            skipped += 1
            continue
        if not brand or not str(brand).strip():
            errors.append(ImportRowError(row=i, reason="Missing required field: Brand"))
            skipped += 1
            continue

        # Quantity: blank/None = 1; otherwise a positive integer (rows from an
        # older 11-column template simply have nothing in this slot).
        quantity = 1
        if quantity_val is not None and str(quantity_val).strip() != "":
            try:
                quantity = int(quantity_val)
            except (TypeError, ValueError):
                errors.append(ImportRowError(row=i, reason=f"Invalid Quantity value: {quantity_val!r} (must be a whole number ≥ 1)"))
                skipped += 1
                continue
            if quantity < 1:
                errors.append(ImportRowError(row=i, reason=f"Invalid Quantity value: {quantity!r} (must be ≥ 1)"))
                skipped += 1
                continue

        try:
            price_float = float(price)
        except (TypeError, ValueError):
            errors.append(ImportRowError(row=i, reason=f"Invalid Price value: {price!r}"))
            skipped += 1
            continue
        # Whole-dollar pricing: round UP to the nearest dollar (decision
        # 2026-08-29) so consignment prices never carry cents from templates.
        # Reject non-finite (NaN/inf) and negative values first — ceil(NaN)
        # raises ValueError and ceil(inf) OverflowError, which would otherwise
        # fail the whole file with an unhandled 500 or cryptic message.
        if not math.isfinite(price_float):
            errors.append(ImportRowError(row=i, reason=f"Invalid Price value: {price!r} (must be a real number)"))
            skipped += 1
            continue
        if price_float < 0:
            errors.append(ImportRowError(row=i, reason=f"Invalid Price value: {price!r} (must be ≥ 0)"))
            skipped += 1
            continue
        price_float = float(math.ceil(price_float))

        # Brand closest-match: replace with an existing brand if one is close.
        brand_str = str(brand).strip()
        matched = closest_brand(brand_str, brands_pool)
        if matched is not None:
            brand_str = matched
        elif brand_str not in brands_pool:
            brands_pool.append(brand_str)  # later rows can match this newly-seen brand

        item_code = f"{prefix}{next_seq:02d}"
        used = str(used_str).strip().lower() != "no" if used_str is not None else True
        # Inherit donate_unsold from the intake when the row leaves it blank.
        if donate_str is None or str(donate_str).strip() == "":
            donate = intake.donate_unsold
        else:
            donate = str(donate_str).strip().lower() == "yes"

        year_int = None
        if year is not None:
            try:
                year_int = int(year)
            except (TypeError, ValueError):
                year_int = None

        db.add(Item(
            intake_id=intake.id,
            seller_id=seller.id,
            code=item_code,
            barcode_39=item_code,
            description=str(description),
            # Category/Type normalize case-insensitively to canonical casing
            # ("skis" → "Skis", "ALPINE SKI" → "Alpine Ski"); unknown values
            # are stored as typed, never rejected.
            category=canonicalize_category(str(category)) if category else None,
            brand=brand_str,
            type=canonicalize_type(str(type_)) if type_ else None,
            color=str(color) if color else None,
            size=str(size) if size else None,
            gender_age=str(gender_age) if gender_age else None,
            year=year_int,
            price=price_float,
            quantity=quantity,
            used=used,
            donate_unsold=donate,
            created_by=username,
        ))
        next_seq += 1
        imported += 1

    db.commit()
    return ImportResult(imported=imported, skipped=skipped, errors=errors)