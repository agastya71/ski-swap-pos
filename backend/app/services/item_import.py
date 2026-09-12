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
import datetime
import io
import math
from io import BytesIO
from typing import Any

import openpyxl
from sqlalchemy.orm import Session

from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller
from app.schemas.item import (
    ImportResult,
    ImportRowError,
    SellerMatchReview,
    WorksheetImportResult,
)
from app.services.brand_match import closest_brand
from app.services.canonical import canonicalize_category, canonicalize_type
from app.services.codes import next_item_seq, next_seller_code


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
        ws = wb.active
        if ws is None:
            raise ValueError("Uploaded xlsx has no readable sheet")
        return [list(row) for row in ws.iter_rows(min_row=2, values_only=True)]
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


def _import_rows(
    db: Session,
    intake: Intake,
    seller: Seller,
    username: str,
    rows: list[list[Any]],
    first_row_no: int,
) -> ImportResult:
    """Create item rows from parsed data rows (shared by both import flows).

    ``first_row_no`` is the sheet row number of the first data row, used for
    per-row error reporting.
    """
    brands_pool = _existing_brands(db, seller)

    # Item codes are globally-unique: seller code + an unpadded sequence
    # number (e.g. "JSMI11"). The bump loop skips codes already taken by any
    # seller (codes can be prefixes of one another); rows added below are
    # tracked with a local counter because pending (uncommitted) rows are not
    # visible to queries under autoflush=False.
    prefix = f"{seller.code}"
    seq = next_item_seq(db, seller)

    errors: list[ImportRowError] = []
    imported = 0
    skipped = 0

    for i, row in enumerate(rows, start=first_row_no):  # header row(s) above
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
        # Whole-dollar pricing: round UP to the nearest dollar (decision
        # 2026-08-29). math.ceil returns an int for finite input; the Float
        # column coerces on flush, so no redundant float() call (which the
        # analyzer's unchecked-throwing-call rule would flag).
        price_float = math.ceil(price_float)

        # Brand closest-match: replace with an existing brand if one is close.
        brand_str = str(brand).strip()
        matched = closest_brand(brand_str, brands_pool)
        if matched is not None:
            brand_str = matched
        elif brand_str not in brands_pool:
            brands_pool.append(brand_str)  # later rows can match this newly-seen brand

        item_code = f"{prefix}{seq}"
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
            remaining=quantity,
            used=used,
            donate_unsold=donate,
            created_by=username,
        ))
        seq += 1
        imported += 1

    db.commit()
    return ImportResult(imported=imported, skipped=skipped, errors=errors)


def import_items(
    db: Session,
    intake: Intake,
    seller: Seller,
    username: str,
    filename: str,
    data: bytes,
) -> ImportResult:
    """Import items from an uploaded template into the given intake session.

    Legacy/standard layout: the item header is the first row and data starts
    on row 2. The seller is fixed by the intake. For worksheets that carry a
    seller-info block (Last / First / ... rows above the item header), use
    ``import_items_with_seller`` instead.
    """
    try:
        rows = parse_upload(filename, data)
    except ValueError as exc:
        raise exc
    return _import_rows(db, intake, seller, username, rows, first_row_no=2)


# ── Seller worksheet import (seller-info block + item table) ─────────────────

_SELLER_LABELS = ("last", "first", "address", "city", "state", "zip", "phone", "email")


def _norm(value: Any) -> str:
    """Case- and whitespace-insensitive normalization for match comparisons."""
    if value is None:
        return ""
    return " ".join(str(value).split()).strip().casefold()


def _digits(value: Any) -> str:
    """Digits-only comparison key for phone numbers."""
    if value is None:
        return ""
    return "".join(ch for ch in str(value) if ch.isdigit())


def _cell(row: list[Any], col: int) -> Any:
    return row[col] if len(row) > col else None


def _find_seller_block(rows: list[list[Any]]) -> tuple[dict[str, str | None], int] | None:
    """Locate the enriched-template seller block (added 2026-09-12).

    Layout: consecutive rows whose column A reads Last, First, Address, City,
    State, Zip, Phone, Email (values in column B), followed by the item table
    header (first cell 'Description'). Returns the seller info dict and the
    item-header row index, or None when the file is the legacy layout (item
    header in the first row, no seller block).
    """
    limit = min(10, len(rows))
    for idx in range(limit):
        if _norm(_cell(rows[idx], 0)) != "last":
            continue
        if idx + 1 >= len(rows) or _norm(_cell(rows[idx + 1], 0)) != "first":
            continue
        info: dict[str, str | None] = {}
        for j, label in enumerate(_SELLER_LABELS):
            raw = _cell(rows[idx + j], 1) if idx + j < len(rows) else None
            text = str(raw).strip() if raw is not None and str(raw).strip() != "" else None
            info[label] = text
        for k in range(idx + len(_SELLER_LABELS), len(rows)):
            if _norm(_cell(rows[k], 0)) == "description":
                return info, k
        raise ValueError("Template item header row (Description, ...) not found below the seller block")
    return None


def _seller_display_name(seller: Seller) -> str | None:
    """'First Last' for individuals; company name fallback for vendors."""
    parts = [
        str(v).strip()
        for v in (seller.first_name, seller.last_name)
        if v is not None and str(v).strip() != ""
    ]
    if parts:
        return " ".join(parts)
    return str(seller.company) if seller.company is not None else None


def _find_seller_candidates(
    db: Session, event, info: dict[str, str | None]
) -> tuple[list[tuple[Seller, str]], str]:
    """Find existing sellers that look like duplicates of the worksheet seller.

    Dedup verification — every plausible duplicate is surfaced for the intake
    user to judge (human-in-the-loop, added 2026-09-12); the caller never
    auto-picks:
      1. Name matches (case/whitespace-insensitive First + Last) within the
         active event — one or many.
      2. Zero name matches fall back to contact-only candidates (email first,
         then phone) so a re-submitted worksheet with a misspelled name still
         flags the existing seller.
    Returns ([(seller, reason), ...], overall_reason).
    """
    first = info.get("first")
    last = info.get("last")
    sellers = db.query(Seller).filter(Seller.event_id == event.id).all()
    email = info.get("email")
    phone = info.get("phone")

    def _email_matches(s: Seller) -> bool:
        return email is not None and s.email is not None and _norm(s.email) == _norm(email)

    def _phone_matches(s: Seller) -> bool:
        return phone is not None and s.phone is not None and _digits(s.phone) == _digits(phone)

    name_matches = [
        s
        for s in sellers
        if _norm(s.first_name) == _norm(first) and _norm(s.last_name) == _norm(last)
    ]
    if name_matches:
        candidates: list[tuple[Seller, str]] = []
        for s in name_matches:
            reason = "Exact name match"
            if _email_matches(s):
                reason += "; email matches the worksheet"
            elif _phone_matches(s):
                reason += "; phone matches the worksheet"
            candidates.append((s, reason))
        overall = (
            "One existing seller matches the worksheet name exactly — confirm it is the same "
            "person, or record a new seller."
            if len(name_matches) == 1
            else f"{len(name_matches)} existing sellers share this name — pick the right one, "
            "or record a new seller."
        )
        return candidates, overall
    email_candidates = [s for s in sellers if _email_matches(s)]
    if email_candidates:
        return (
            [
                (s, "Email matches the worksheet (name does not match)")
                for s in email_candidates
            ],
            "No name match — the worksheet email identifies existing seller(s). Confirm the "
            "seller, or record a new one.",
        )
    phone_candidates = [s for s in sellers if _phone_matches(s)]
    if phone_candidates:
        return (
            [
                (s, "Phone matches the worksheet (name does not match)")
                for s in phone_candidates
            ],
            "No name match — the worksheet phone identifies existing seller(s). Confirm the "
            "seller, or record a new one.",
        )
    return [], ""


def _create_seller_from_block(db: Session, event, info: dict[str, str | None]) -> Seller:
    """Create a new seller from the worksheet seller block (code via ``next_seller_code``)."""
    new_seller = Seller(
        event_id=event.id,
        code=next_seller_code(db, info.get("first"), info.get("last"), None, False),
        first_name=info.get("first"),
        last_name=info.get("last"),
        address=info.get("address"),
        city=info.get("city"),
        state=info.get("state"),
        zip=info.get("zip"),
        phone=info.get("phone"),
        email=info.get("email"),
        is_vendor=False,
    )
    db.add(new_seller)
    db.flush()
    return new_seller


def _resolve_intake(db: Session, seller: Seller) -> tuple[Intake, bool]:
    """Reuse the seller's most recent intake in the event, or create one.

    Reusing avoids duplicate intake sessions when the same seller submits
    another worksheet later.
    """
    existing = (
        db.query(Intake)
        .filter(Intake.seller_id == seller.id)
        .order_by(Intake.id.desc())
        .first()
    )
    if existing is not None:
        return existing, False
    intake = Intake(
        seller_id=seller.id,
        date_entered=datetime.date.today(),
        donate_unsold=False,
        donate_proceeds=False,
    )
    db.add(intake)
    db.flush()
    return intake, True


def import_items_with_seller(
    db: Session,
    event,
    username: str,
    filename: str,
    data: bytes,
    seller_code: str | None = None,
    force_new: bool = False,
) -> WorksheetImportResult | SellerMatchReview:
    """Import a seller worksheet: seller-info block + item table (2026-09-12).

    Dedup is human-in-the-loop: when existing sellers look like duplicates of
    the worksheet seller (name or contact match), a ``SellerMatchReview`` is
    returned listing each candidate with the reason it was surfaced — nothing
    is imported. The intake user then re-submits with ``seller_code`` ("same
    seller — reuse it") or ``force_new`` ("genuinely a new record"). With no
    candidates the seller is created and the items import immediately.

    ``seller_code``: reuse exactly that seller (must exist in the event).
    ``force_new``: create a new seller from the worksheet block even when a
    duplicate-looking seller exists — an explicit user decision. The two
    parameters are mutually exclusive.
    """
    if seller_code and force_new:
        raise ValueError("Pass either seller_code or force_new, not both.")
    try:
        rows = parse_upload(filename, data)
    except ValueError as exc:
        raise exc
    block = _find_seller_block(rows)
    if block is None:
        raise ValueError(
            "No seller info block found in the worksheet (expected rows starting with Last / First "
            "above the item header). Use the per-intake import for the plain 12-column template."
        )
    info, header_idx = block
    if not info.get("first") and not info.get("last"):
        raise ValueError(
            "Seller info is missing from the worksheet (fill in Last / First in the seller block), "
            "or use the per-intake import with the plain template."
        )

    matched_by: str | None
    if seller_code is not None:
        seller = (
            db.query(Seller)
            .filter(Seller.code == str(seller_code), Seller.event_id == event.id)
            .first()
        )
        if seller is None:
            raise ValueError(f"Seller code {seller_code} not found in the active event.")
        matched_by = "user selection"
        created = False
    elif force_new:
        seller = _create_seller_from_block(db, event, info)
        matched_by = None
        created = True
    else:
        candidates, reason = _find_seller_candidates(db, event, info)
        if candidates:
            review_candidates = []
            for cand, cand_reason in candidates:
                review_candidates.append(
                    {
                        "code": str(cand.code),
                        "name": _seller_display_name(cand),
                        "email": str(cand.email) if cand.email is not None else None,
                        "phone": str(cand.phone) if cand.phone is not None else None,
                        "existing_intakes": db.query(Intake)
                        .filter(Intake.seller_id == cand.id)
                        .count(),
                        "match_reason": cand_reason,
                    }
                )
            return SellerMatchReview.model_validate(
                {
                    "needs_review": True,
                    "reason": reason,
                    "worksheet_name": " ".join(
                        part for part in (info.get("first"), info.get("last")) if part
                    )
                    or None,
                    "worksheet_email": info.get("email"),
                    "worksheet_phone": info.get("phone"),
                    "candidates": review_candidates,
                }
            )
        seller = _create_seller_from_block(db, event, info)
        matched_by = None
        created = True
    intake, intake_created = _resolve_intake(db, seller)
    result = _import_rows(db, intake, seller, username, rows[header_idx + 1:], first_row_no=header_idx + 2)
    seller_name = " ".join(
        part
        for part in (
            info.get("first") or (str(seller.first_name) if seller.first_name is not None else ""),
            info.get("last") or (str(seller.last_name) if seller.last_name is not None else ""),
        )
        if part
    )
    return WorksheetImportResult.model_validate(
        {
            "seller_code": seller.code,
            "seller_name": seller_name,
            "seller_created": created,
            "seller_matched_by": matched_by,
            "intake_id": intake.id,
            "intake_created": intake_created,
            "imported": result.imported,
            "skipped": result.skipped,
            "errors": result.errors,
        }
    )