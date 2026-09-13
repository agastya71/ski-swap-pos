"""Item router — manages individual consignment items for lookup, editing, and printing; requires admin, intake, or cashier role."""

from io import BytesIO

import openpyxl
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller
from app.models.user import User
from app.schemas.item import (
    ItemLookupResponse,
    ItemQuantityAdjustment,
    ItemResponse,
    ItemSearchResult,
    ItemUpdate,
    SellerMatchReview,
    WorksheetImportResult,
)
from app.services.canonical import CATEGORY_BRANDS
from app.services.zpl import generate_zpl, send_to_printer

router = APIRouter(prefix="/items", tags=["items"])

_INTAKE_ADMIN = require_roles("admin", "intake")
_CASHIER_ADMIN = require_roles("admin", "cashier")


def _item_for_active_event(item_id: int, db: Session) -> Item:
    """Fetch an item belonging to the active event, or raise 503/404 as appropriate."""
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    item = (
        db.query(Item)
        .join(Intake)
        .join(Seller)
        .filter(Item.id == item_id, Seller.event_id == event.id, Item.is_deleted.is_(False))
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.get("/lookup", response_model=ItemLookupResponse)
def lookup_item(
    code: str,
    db: Session = Depends(get_db),
    _user: User = Depends(_CASHIER_ADMIN),
):
    """Look up a single item by its exact item code for point-of-sale scanning."""
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    item = (
        db.query(Item)
        .join(Intake)
        .join(Seller)
        .filter(Item.code == code, Seller.event_id == event.id, Item.is_deleted.is_(False))
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return ItemLookupResponse.model_validate({**item.__dict__, "seller_code": item.seller.code})


@router.get("/search", response_model=list[ItemLookupResponse])
def search_items(
    q: str,
    db: Session = Depends(get_db),
    _user: User = Depends(_CASHIER_ADMIN),
):
    """Search items by partial match on the ITEM CODE only (checkout flow).

    Deliberately narrower than the intake full-field search: at checkout the
    cashier looks up items by their code/barcode, not by description or brand.
    """
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    like = f"%{q}%"
    items = (
        db.query(Item)
        .join(Intake)
        .join(Seller)
        .filter(
            (Item.code.ilike(like)),
            Seller.event_id == event.id,
            Item.is_deleted.is_(False),
        )
        .order_by(Item.code)
        .limit(20)
        .all()
    )
    return [
        ItemLookupResponse.model_validate({**item.__dict__, "seller_code": item.seller.code})
        for item in items
    ]


@router.get("/brands", response_model=list[str])
def list_brands(
    q: str = "",
    category: str = "",
    db: Session = Depends(get_db),
    _user: User = Depends(_CASHIER_ADMIN),
):
    """Return distinct brand names for the active event, optionally filtered by
    prefix and/or by category (brands that have been assigned to that category).

    Used by the POS/intake brand typeahead to suggest close alternatives; the
    intake form passes the selected category so only category-appropriate
    brands are offered (case-insensitive match on the stored category).
    """
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    query = (
        db.query(Item.brand)
        .join(Intake)
        .join(Seller)
        .filter(Seller.event_id == event.id, Item.is_deleted.is_(False), Item.brand.isnot(None))
        .distinct()
    )
    if q.strip():
        query = query.filter(Item.brand.ilike(f"%{q.strip()}%"))
    if category.strip():
        query = query.filter(Item.category.ilike(category.strip()))

    db_brands = [b[0] for b in query.order_by(Item.brand).all() if b[0]]

    # Merge the curated per-category catalog so the typeahead offers known
    # brands even before any item uses them (matched case-insensitively on
    # the requested category, q-filtered, deduped against the data).
    merged: list[str] = []
    seen_lower: set[str] = set()
    if category.strip():
        cat_key = category.strip().lower()
        catalog = next(
            (brands for key, brands in CATEGORY_BRANDS.items() if key.lower() == cat_key),
            [],
        )
        for brand in catalog:
            probe = brand.lower()
            if q.strip() and q.strip().lower() not in probe:
                continue
            if probe not in seen_lower:
                merged.append(brand)
                seen_lower.add(probe)
    for brand in db_brands:
        probe = brand.lower()
        if probe not in seen_lower:
            merged.append(brand)
            seen_lower.add(probe)
    return sorted(merged, key=str.lower)


# ── Intake item search (all fields) ──────────────────────────────────────────

_SEARCH_TEXT_COLUMNS = (
    Item.code, Item.description, Item.category, Item.brand, Item.type,
    Item.color, Item.size, Item.gender_age, Item.barcode_39, Item.status,
    Seller.code, Seller.first_name, Seller.last_name, Seller.company,
)
_SEARCH_NUMERIC_COLUMNS = (Item.year, Item.price, Item.quantity, Item.remaining)


def _seller_name(seller: Seller) -> str:
    """Display name for a seller: 'First Last' for individuals, company for vendors.

    getattr() is used because model attributes are untyped SQLAlchemy Columns
    (the analyzer flags direct truthiness/iteration on them); it returns Any,
    so runtime behavior is identical while staying analyzer-clean.
    """
    first = getattr(seller, "first_name", None)
    last = getattr(seller, "last_name", None)
    name = f"{first} {last}".strip() if (first or last) else ""
    return name or (getattr(seller, "company", "") or "")


def _intake_search_query(db: Session, event: Event, q: str, status: str):
    """Query for intake items of the active event matching `q` across every
    item, seller, and numeric (text-cast) field, optionally filtered by status."""
    query = (
        db.query(Item)
        .join(Intake)
        .join(Seller)
        .filter(Seller.event_id == event.id, Item.is_deleted.is_(False))
    )
    if q:
        like = f"%{q}%"
        text_matches = [col.ilike(like) for col in _SEARCH_TEXT_COLUMNS]
        text_matches += [cast(col, String).ilike(like) for col in _SEARCH_NUMERIC_COLUMNS]
        query = query.filter(or_(*text_matches))
    if status:
        query = query.filter(Item.status == status.lower())
    return query.order_by(Item.code)


@router.get("/intake-search", response_model=list[ItemSearchResult])
def intake_search_items(
    q: str = "",
    status: str = "",
    limit: int = 100,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Search ALL intake items for the active event, across every field.

    Matches (case-insensitive) on item code, description, category, brand,
    type, color, size, gender/age, barcode, status, year, price, quantity,
    remaining, and the seller's code/name/company. An empty `q` lists all
    items (bounded by `limit`); `status` optionally narrows the lifecycle
    status (available/sold/donated/returned).
    """
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    limit = min(max(limit, 1), 500)
    items = _intake_search_query(db, event, q, status).limit(limit).all()
    return [
        ItemSearchResult.model_validate(
            {**item.__dict__, "seller_code": item.seller.code, "seller_name": _seller_name(item.seller)}
        )
        for item in items
    ]


@router.get("/intake-search/export")
def export_intake_search(
    q: str = "",
    status: str = "",
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Excel export of the current intake-item search results (same filters as
    /items/intake-search; bounded at 10000 rows)."""
    from datetime import datetime, timezone

    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    items = _intake_search_query(db, event, q, status).limit(10000).all()

    wb = openpyxl.Workbook()
    ws = wb.active
    if ws is None:  # openpyxl stubs type .active as Optional — can't happen for a new workbook
        raise HTTPException(status_code=500, detail="Export workbook has no active sheet")
    ws.append([
        "Code", "Description", "Category", "Brand", "Type", "Color",
        "Size", "Gender/Age", "Year", "Price", "Quantity", "Remaining",
        "Used", "Donate if Unsold", "Status", "Seller Code", "Seller Name",
    ])
    for item in items:
        seller = item.seller
        # getattr: see _seller_name — sidesteps Column-truthiness complaints.
        ws.append([
            item.code, item.description, item.category, item.brand, item.type,
            item.color, item.size, item.gender_age, item.year, item.price,
            item.quantity, item.remaining,
            "Yes" if getattr(item, "used") else "No",
            "Yes" if getattr(item, "donate_unsold") else "No", item.status,
            seller.code, _seller_name(seller),
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"intake-items-{datetime.now(timezone.utc).strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

@router.get("/import-template")
def download_import_template(_user: User = Depends(_INTAKE_ADMIN)):
    """Return a blank Excel template for bulk item import.

    Enriched layout (2026-09-12): a seller-info block (Last, First, Address,
    City, State, Zip, Phone, Email — values in column B) followed by the item
    table. Importing this template via POST /items/import-worksheet
    finds-or-creates the seller (deduplicated by name/email/phone), reuses or
    creates the seller's intake, and imports the item rows below the header.
    The plain layout (item header only) remains valid for the per-intake
    import endpoint: Description, Category, Brand, Type, Color, Size,
    Gender/Age, Year, Price, Used, Donate if Unsold, Quantity. Quantity
    (blank = 1) represents how many identical units one row covers.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    if ws is None:  # openpyxl stubs type .active as Optional; can't happen for a new workbook
        raise HTTPException(status_code=500, detail="Template workbook has no active sheet")
    ws.append(["Seller Info (finds or creates the seller — fill in column B):", None])
    for label in ["Last", "First", "Address", "City", "State", "Zip", "Phone", "Email"]:
        ws.append([label, None])
    ws.append([None])
    ws.append([
        "Description", "Category", "Brand", "Type", "Color",
        "Size", "Gender/Age", "Year", "Price", "Used", "Donate if Unsold", "Quantity",
    ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=import-template.xlsx"},
    )


@router.post("/import-worksheet", response_model=WorksheetImportResult | SellerMatchReview)
def import_seller_worksheet(
    file: UploadFile = File(...),
    seller_code: str | None = None,
    force_new: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(_INTAKE_ADMIN),
):
    """Import a seller worksheet: a seller-info block above the item table.

    When existing sellers look like duplicates of the worksheet seller (name
    or contact match), returns a ``SellerMatchReview`` listing each candidate
    with the reason it was surfaced — the intake user decides. Re-submit the
    same file with ``seller_code`` to reuse that seller, or ``force_new`` to
    record a new one. With no candidates the seller is created and the items
    import immediately, returning a ``WorksheetImportResult``.
    """
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    data = file.file.read()
    try:
        from app.services.item_import import import_items_with_seller as _impl
        return _impl(db, event, current_user.username, file.filename, data, seller_code=seller_code, force_new=force_new)  # pyright: ignore[reportArgumentType]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/{item_id}", response_model=ItemResponse)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Return full details for a single item."""
    return _item_for_active_event(item_id, db)


@router.patch("/{item_id}", response_model=ItemResponse)
def update_item(
    item_id: int,
    body: ItemUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Update editable fields on an item such as price or description."""
    item = _item_for_active_event(item_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{item_id}/label", response_model=ItemResponse)
def print_item_label(
    item_id: int,
    copies: int | None = None,
    code_as_text: bool = False,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Send a ZPL label for the item to the configured label printer.

    Optional ``copies``: print exactly that many labels (>= 1). When omitted,
    the label prints one copy per on-hand remaining unit (the default "one
    tag per unit" decision).

    Optional ``code_as_text``: render the item code as large text instead of
    a barcode (details otherwise unchanged).
    """
    item = _item_for_active_event(item_id, db)
    if copies is not None and copies < 1:
        raise HTTPException(status_code=422, detail="Copies must be at least 1")
    event = db.query(Event).filter(Event.is_active == True).first()
    zpl = generate_zpl(
        item,
        copies=copies,
        code_as_text=code_as_text,
        event_name=str(event.name) if event else None,
    )
    try:
        send_to_printer(zpl)
    except OSError as e:
        raise HTTPException(status_code=503, detail=f"Printer unavailable: {e}")
    item.label_printed = True  # pyright: ignore[reportAttributeAccessIssue]
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Soft-delete an item that has not yet had its label printed or been sold.

    Sets ``is_deleted=True``; the row is retained for audit. Allowed only when
    the item is not label-printed and is still ``available`` (no sales). Sold
    or partially-sold items cannot be deleted.
    """
    item = _item_for_active_event(item_id, db)
    if item.label_printed:  # pyright: ignore[reportGeneralTypeIssues]
        raise HTTPException(status_code=409, detail="Cannot delete item after label has been printed")
    if item.status != "available":  # pyright: ignore[reportGeneralTypeIssues]
        raise HTTPException(status_code=409, detail="Cannot delete an item that has been sold")
    item.is_deleted = True  # pyright: ignore[reportAttributeAccessIssue]
    db.commit()
    return Response(status_code=204)


@router.patch("/{item_id}/quantity", response_model=ItemResponse)
def adjust_item_quantity(
    item_id: int,
    body: ItemQuantityAdjustment,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Adjust an item's on-hand remaining quantity by a signed delta.

    This corrects the CONSIGNMENT COUNT: the same delta is applied to BOTH
    ``quantity`` (original intake units) and ``remaining`` (on-hand units), so
    the invariant ``remaining = quantity − sold`` — enforced by the start.sh
    re-sync — survives manual corrections. The result may not fall below 0
    (already-sold units are tracked via sale_item and cannot be adjusted out).
    """
    item = _item_for_active_event(item_id, db)
    new_remaining = getattr(item, "remaining") + body.adjustment
    # item.remaining is the on-hand sellable count; floor is 0 (sold units are
    # tracked via sale_item and cannot be adjusted away).
    if new_remaining < 0:
        raise HTTPException(
            status_code=422,
            detail="Quantity cannot be reduced below zero (would imply fewer units than already sold)",
        )
    item.remaining = new_remaining  # pyright: ignore[reportAttributeAccessIssue]
    item.quantity = item.quantity + body.adjustment  # pyright: ignore[reportAttributeAccessIssue]
    db.commit()
    db.refresh(item)
    return item
