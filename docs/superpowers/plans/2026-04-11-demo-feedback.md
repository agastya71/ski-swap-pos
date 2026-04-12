# Demo Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement seven post-demo improvements: auto-generated seller/item codes, seller admin view, postal address on intake, full-field checkout search, Excel bulk import, and a searchable seller payout report.

**Architecture:** Backend changes first (auto-codes, search, import); then shared frontend infrastructure (types, SellerCombobox); then form updates and report fix; finally the new Seller admin section wired into AdminPage. Each phase produces independently testable software.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React + TypeScript + Vitest + MSW (frontend), openpyxl (Excel parsing)

**Spec:** `docs/superpowers/specs/2026-04-11-demo-feedback-design.md`

---

## File Map

### Backend — modified
| File | Change |
|---|---|
| `backend/app/schemas/seller.py` | Remove `code` from `SellerCreate` |
| `backend/app/schemas/item.py` | Remove `code` from `ItemCreate`; add `ImportRowError`, `ImportResult` |
| `backend/app/routers/sellers.py` | Auto-assign seller code; add `GET /sellers/{id}/items` |
| `backend/app/routers/intakes.py` | Auto-assign item code; add `POST /intakes/{id}/items/import` |
| `backend/app/routers/items.py` | Extend search filter; add `GET /items/import-template` |
| `backend/requirements.txt` | Add `openpyxl` |

### Backend — modified tests
| File | Change |
|---|---|
| `backend/tests/test_sellers.py` | Remove code from payloads; update assertions; remove duplicate-code test; add auto-code + items endpoint tests |
| `backend/tests/test_intakes.py` | Remove code from item payloads; update assertions; add import tests |
| `backend/tests/test_items.py` | Remove code from item payloads; add multi-field search tests |

### Frontend — modified
| File | Change |
|---|---|
| `frontend/src/types.ts` | Remove `code` from `SellerCreate`; remove `code` from `ItemCreate`; add `ImportResult` |
| `frontend/src/api/intakes.ts` | Update `addItem` JSDoc; add `importItems` |
| `frontend/src/api/items.ts` | Add `downloadImportTemplate` |
| `frontend/src/api/sellers.ts` | Add `listSellerItems` |
| `frontend/src/intake/SellerForm.tsx` | Remove code field; add address fields |
| `frontend/src/intake/ItemForm.tsx` | Remove code field |
| `frontend/src/admin/ReportsPage.tsx` | Replace numeric ID input with `SellerCombobox`; add line-items table |
| `frontend/src/admin/AdminPage.tsx` | Add Sellers tab; render `SellersSection` |
| `frontend/src/mocks/handlers.ts` | Update seller/item POST handlers; add new route handlers |

### Frontend — new
| File | Purpose |
|---|---|
| `frontend/src/components/SellerCombobox.tsx` | Shared debounced seller search dropdown |
| `frontend/src/admin/SellerListPage.tsx` | Sellers list with search |
| `frontend/src/admin/SellerDetailPage.tsx` | Per-seller contact card + items table + import |

### Frontend — new tests
| File | Tests |
|---|---|
| `frontend/src/components/SellerCombobox.test.tsx` | Renders, searches, selects, clears |
| `frontend/src/admin/SellerListPage.test.tsx` | Renders list, search, click navigates to detail |
| `frontend/src/admin/SellerDetailPage.test.tsx` | Renders contact, items, add/edit/delete, import |

### Frontend — updated tests
| File | Change |
|---|---|
| `frontend/src/intake/SellerForm.test.tsx` | Remove code field test; add address field tests |
| `frontend/src/intake/ItemForm.test.tsx` | Remove code field test |
| `frontend/src/admin/ReportsPage.test.tsx` | Replace seller ID input test with combobox; add line-items table test |
| `frontend/src/admin/AdminPage.test.tsx` | Add Sellers tab test |

---

## Task 1: Backend — Auto-generate seller codes + seller items endpoint

**Files:**
- Modify: `backend/app/schemas/seller.py`
- Modify: `backend/app/routers/sellers.py`
- Modify: `backend/tests/test_sellers.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_sellers.py  — add these two tests, update existing ones

def test_create_seller_auto_assigns_code(client, active_event, admin_token):
    """POST /sellers assigns a sequential 3-digit code; client need not provide one."""
    r = client.post(
        "/sellers",
        json={"first_name": "Jane", "last_name": "Smith"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    assert r.json()["code"] == "001"


def test_create_two_sellers_increments_code(client, active_event, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    client.post("/sellers", json={"first_name": "A", "last_name": "B"}, headers=headers)
    r2 = client.post("/sellers", json={"first_name": "C", "last_name": "D"}, headers=headers)
    assert r2.json()["code"] == "002"


def test_list_seller_items_empty(client, active_event, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    # Create a seller first
    r = client.post("/sellers", json={"first_name": "X", "last_name": "Y"}, headers=headers)
    seller_id = r.json()["id"]
    r2 = client.get(f"/sellers/{seller_id}/items", headers=headers)
    assert r2.status_code == 200
    assert r2.json() == []
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && pytest tests/test_sellers.py::test_create_seller_auto_assigns_code tests/test_sellers.py::test_create_two_sellers_increments_code tests/test_sellers.py::test_list_seller_items_empty -v
```

Expected: FAIL (422 Validation Error — `first_name`/`last_name` accepted but `code` required; endpoint not found)

- [ ] **Step 3: Update `SellerCreate` — remove `code`**

```python
# backend/app/schemas/seller.py
class SellerCreate(BaseModel):
    """Payload for registering a new seller (consignor) in the active event."""

    first_name: str = Field(description="Seller's given name.")
    last_name: str = Field(description="Seller's family name.")
    company: Optional[str] = Field(default=None, description="Company or organization name, if the seller is a vendor.")
    is_vendor: bool = Field(default=False, description="True if this seller is a commercial vendor rather than an individual consignor.")
    email: Optional[str] = Field(default=None, description="Seller's email address.")
    phone: Optional[str] = Field(default=None, description="Seller's contact phone number.")
    address: Optional[str] = Field(default=None, description="Street address.")
    city: Optional[str] = Field(default=None, description="City.")
    state: Optional[str] = Field(default=None, description="Two-letter state abbreviation.")
    zip: Optional[str] = Field(default=None, description="ZIP code.")
```

- [ ] **Step 4: Update `sellers.py` router — auto-code on create, add items endpoint**

Replace the full file:

```python
"""Seller management router — registers and manages consignment sellers; requires admin or intake role."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller
from app.models.user import User
from app.schemas.intake import IntakeResponse
from app.schemas.item import ItemResponse
from app.schemas.seller import SellerCreate, SellerResponse, SellerUpdate

router = APIRouter(prefix="/sellers", tags=["sellers"])

_INTAKE_ADMIN = require_roles("admin", "intake")


def _active_event(db: Session) -> Event:
    """Return the currently active event or raise 503 if none is configured."""
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    return event


def _next_seller_code(event_id: int, db: Session) -> str:
    """Return the next sequential 3-digit zero-padded seller code for the event."""
    max_code = (
        db.query(func.max(Seller.code))
        .filter(Seller.event_id == event_id)
        .scalar()
    )
    if max_code is None:
        return "001"
    return f"{int(max_code) + 1:03d}"


@router.get("", response_model=list[SellerResponse])
def list_sellers(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """List sellers for the active event, with optional search by code or name."""
    event = _active_event(db)
    query = db.query(Seller).filter(Seller.event_id == event.id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            Seller.code.ilike(like)
            | Seller.first_name.ilike(like)
            | Seller.last_name.ilike(like)
            | Seller.company.ilike(like)
        )
    return query.order_by(Seller.code).all()


@router.post("", response_model=SellerResponse, status_code=201)
def create_seller(
    body: SellerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_INTAKE_ADMIN),
):
    """Register a new seller for the active event with an auto-generated code."""
    event = _active_event(db)
    code = _next_seller_code(event.id, db)
    seller = Seller(
        **body.model_dump(),
        code=code,
        event_id=event.id,
        created_by=current_user.username,
    )
    db.add(seller)
    db.commit()
    db.refresh(seller)
    return seller


@router.get("/{seller_id}", response_model=SellerResponse)
def get_seller(
    seller_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Return a single seller by ID within the active event."""
    event = _active_event(db)
    seller = (
        db.query(Seller)
        .filter(Seller.id == seller_id, Seller.event_id == event.id)
        .first()
    )
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    return seller


@router.get("/{seller_id}/intakes", response_model=list[IntakeResponse])
def list_seller_intakes(
    seller_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """List all intake sessions associated with a given seller."""
    event = _active_event(db)
    seller = (
        db.query(Seller)
        .filter(Seller.id == seller_id, Seller.event_id == event.id)
        .first()
    )
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    return (
        db.query(Intake)
        .filter(Intake.seller_id == seller_id)
        .order_by(Intake.id.desc())
        .all()
    )


@router.get("/{seller_id}/items", response_model=list[ItemResponse])
def list_seller_items(
    seller_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """List all items for a seller in the active event, ordered by item code."""
    event = _active_event(db)
    seller = (
        db.query(Seller)
        .filter(Seller.id == seller_id, Seller.event_id == event.id)
        .first()
    )
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    return (
        db.query(Item)
        .filter(Item.seller_id == seller_id)
        .order_by(Item.code)
        .all()
    )


@router.patch("/{seller_id}", response_model=SellerResponse)
def update_seller(
    seller_id: int,
    body: SellerUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Update editable fields on an existing seller record."""
    event = _active_event(db)
    seller = (
        db.query(Seller)
        .filter(Seller.id == seller_id, Seller.event_id == event.id)
        .first()
    )
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(seller, field, value)
    db.commit()
    db.refresh(seller)
    return seller
```

- [ ] **Step 5: Update existing seller tests — remove `code` from payloads**

In `backend/tests/test_sellers.py`, find every `json={..., "code": "...", ...}` payload in a `POST /sellers` call and remove the `"code"` key. Also remove the `test_create_seller_duplicate_code_returns_409` test entirely (codes are auto-generated, cannot duplicate). Update any assertion that checks `r.json()["code"] == "S001"` to check the code starts with `"0"` and has 3 digits, e.g. `assert len(r.json()["code"]) == 3`.

- [ ] **Step 6: Run all seller tests — verify they pass**

```bash
cd backend && pytest tests/test_sellers.py -v
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/schemas/seller.py app/routers/sellers.py tests/test_sellers.py
git commit -m "feat: auto-generate seller codes; add GET /sellers/{id}/items"
```

---

## Task 2: Backend — Auto-generate item codes

**Files:**
- Modify: `backend/app/schemas/item.py`
- Modify: `backend/app/routers/intakes.py`
- Modify: `backend/tests/test_intakes.py`
- Modify: `backend/tests/test_items.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_intakes.py — add these tests

def test_add_item_auto_assigns_code(client, active_event, admin_token):
    """POST /intakes/{id}/items auto-generates item code as {seller_code}-01."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json={"first_name": "A", "last_name": "B"}, headers=headers)
    seller_code = seller_r.json()["code"]  # e.g. "001"
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    intake_id = intake_r.json()["id"]

    item_r = client.post(
        f"/intakes/{intake_id}/items",
        json={"description": "Ski boots", "price": 50.0},
        headers=headers,
    )
    assert item_r.status_code == 201
    assert item_r.json()["code"] == f"{seller_code}-01"


def test_add_two_items_increments_code(client, active_event, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json={"first_name": "A", "last_name": "B"}, headers=headers)
    seller_code = seller_r.json()["code"]
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    intake_id = intake_r.json()["id"]

    client.post(f"/intakes/{intake_id}/items", json={"description": "Skis", "price": 80.0}, headers=headers)
    r2 = client.post(f"/intakes/{intake_id}/items", json={"description": "Boots", "price": 40.0}, headers=headers)
    assert r2.json()["code"] == f"{seller_code}-02"
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && pytest tests/test_intakes.py::test_add_item_auto_assigns_code tests/test_intakes.py::test_add_two_items_increments_code -v
```

Expected: FAIL (422 — `code` required in `ItemCreate`)

- [ ] **Step 3: Update `ItemCreate` — remove `code`**

```python
# backend/app/schemas/item.py — replace ItemCreate

class ItemCreate(BaseModel):
    """Payload for adding a new consigned item to an intake session. Item code is auto-generated."""

    category: Optional[str] = Field(default=None, description="High-level merchandise category (e.g., 'Skis', 'Boots', 'Apparel').")
    brand: Optional[str] = Field(default=None, description="Manufacturer or brand name of the item.")
    type: Optional[str] = Field(default=None, description="Sub-type within the category (e.g., 'Alpine', 'Nordic').")
    description: Optional[str] = Field(default=None, description="Free-text description of the item as it will appear on the label.")
    color: Optional[str] = Field(default=None, description="Color or color combination of the item.")
    size: Optional[str] = Field(default=None, description="Size of the item (length, boot size, clothing size, etc.).")
    uom: Optional[str] = Field(default=None, description="Unit of measure (e.g., 'pair', 'each').")
    gender_age: Optional[str] = Field(default=None, description="Target gender/age group (e.g., 'Men', 'Women', 'Youth').")
    year: Optional[int] = Field(default=None, description="Model year of the item, if known.")
    used: bool = Field(default=True, description="True if the item is used/pre-owned; False if new.")
    price: float = Field(description="Asking price set by the seller in dollars.")
    quantity: float = Field(default=1.0, description="Number of units represented by this item record (usually 1).")
    barcode_39: Optional[str] = Field(default=None, description="Code 39 barcode string to print on the item label. Defaults to the auto-generated item code if omitted.")
    label_line_2: Optional[str] = Field(default=None, description="Second custom text line printed on the item label.")
    label_line_3: Optional[str] = Field(default=None, description="Third custom text line printed on the item label.")
    donate_unsold: bool = Field(default=False, description="If True, this specific item will be donated if it does not sell.")
    vendor_item_id: Optional[str] = Field(default=None, description="External item identifier supplied by a commercial vendor.")
```

- [ ] **Step 4: Update `add_item_to_intake` in `intakes.py`**

Add `from sqlalchemy import func` to the imports at the top, then replace the `add_item_to_intake` function:

```python
from sqlalchemy import func
```

```python
def _next_item_code(seller_id: int, seller_code: str, db: Session) -> str:
    """Return the next sequential item code for a seller (e.g. '001-03')."""
    prefix = f"{seller_code}-"
    max_code = (
        db.query(func.max(Item.code))
        .join(Intake, Item.intake_id == Intake.id)
        .filter(Intake.seller_id == seller_id, Item.code.like(f"{prefix}%"))
        .scalar()
    )
    if max_code is None:
        return f"{prefix}01"
    next_seq = int(max_code.split("-")[-1]) + 1
    return f"{prefix}{next_seq:02d}"


@router.post("/{intake_id}/items", response_model=ItemResponse, status_code=201)
def add_item_to_intake(
    intake_id: int,
    body: ItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_INTAKE_ADMIN),
):
    """Add a single item to an existing intake session with an auto-generated item code."""
    event = _active_event(db)
    intake = _get_intake_for_event(intake_id, event.id, db)
    seller = db.query(Seller).filter(Seller.id == intake.seller_id).first()
    item_code = _next_item_code(intake.seller_id, seller.code, db)
    item = Item(
        intake_id=intake.id,
        seller_id=intake.seller_id,
        code=item_code,
        barcode_39=body.barcode_39 or item_code,
        created_by=current_user.username,
        **body.model_dump(exclude={"barcode_39"}),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item
```

- [ ] **Step 5: Update existing intake and item tests — remove `code` from payloads**

In `backend/tests/test_intakes.py` and `backend/tests/test_items.py`, find every `POST /intakes/{id}/items` call with `"code": "..."` in the JSON payload and remove the `"code"` key. Update any assertion like `assert r.json()["code"] == "S001-01"` to check the code ends with `-01` (`assert r.json()["code"].endswith("-01")`).

Also remove the `test_add_item_duplicate_code_returns_409` test — codes are auto-generated and cannot collide.

- [ ] **Step 6: Run all tests — verify they pass**

```bash
cd backend && pytest tests/test_intakes.py tests/test_items.py -v
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add app/schemas/item.py app/routers/intakes.py tests/test_intakes.py tests/test_items.py
git commit -m "feat: auto-generate item codes as {seller_code}-{nn}"
```

---

## Task 3: Backend — Extend item search to all fields

**Files:**
- Modify: `backend/app/routers/items.py`
- Modify: `backend/tests/test_items.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_items.py — add these tests
# Requires a seller + intake + item fixture. Adapt fixture names to match your conftest.

def test_search_items_by_description(client, active_event, admin_token):
    """GET /items/search?q= matches item description."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json={"first_name": "A", "last_name": "B"}, headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    client.post(
        f"/intakes/{intake_r.json()['id']}/items",
        json={"description": "Atomic skis 160cm", "price": 120.0},
        headers=headers,
    )
    r = client.get("/items/search?q=atomic", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert "Atomic" in r.json()[0]["description"]


def test_search_items_by_brand(client, active_event, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json={"first_name": "A", "last_name": "B"}, headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    client.post(
        f"/intakes/{intake_r.json()['id']}/items",
        json={"brand": "Rossignol", "price": 80.0},
        headers=headers,
    )
    r = client.get("/items/search?q=rossig", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_search_items_by_seller_code(client, active_event, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json={"first_name": "A", "last_name": "B"}, headers=headers)
    seller_code = seller_r.json()["code"]
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    client.post(f"/intakes/{intake_r.json()['id']}/items", json={"price": 30.0}, headers=headers)
    r = client.get(f"/items/search?q={seller_code}", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && pytest tests/test_items.py::test_search_items_by_description tests/test_items.py::test_search_items_by_brand tests/test_items.py::test_search_items_by_seller_code -v
```

Expected: FAIL (search only matches code currently)

- [ ] **Step 3: Update `search_items` filter in `items.py`**

```python
@router.get("/search", response_model=list[ItemLookupResponse])
def search_items(
    q: str,
    db: Session = Depends(get_db),
    _user: User = Depends(_CASHIER_ADMIN),
):
    """Search items by partial match on code, description, category, brand, or seller code."""
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    like = f"%{q}%"
    items = (
        db.query(Item)
        .join(Intake)
        .join(Seller)
        .filter(
            (Item.code.ilike(like))
            | (Item.description.ilike(like))
            | (Item.category.ilike(like))
            | (Item.brand.ilike(like))
            | (Seller.code.ilike(like)),
            Seller.event_id == event.id,
        )
        .order_by(Item.code)
        .limit(20)
        .all()
    )
    return [
        ItemLookupResponse.model_validate({**item.__dict__, "seller_code": item.seller.code})
        for item in items
    ]
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd backend && pytest tests/test_items.py -v
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add app/routers/items.py tests/test_items.py
git commit -m "feat: extend item search to description, brand, category, seller code"
```

---

## Task 4: Backend — Excel import endpoint + template download

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/schemas/item.py`
- Modify: `backend/app/routers/intakes.py`
- Modify: `backend/app/routers/items.py`
- Modify: `backend/tests/test_intakes.py`

- [ ] **Step 1: Add openpyxl**

```text
# backend/requirements.txt — add this line
openpyxl
```

```bash
cd backend && pip install openpyxl
```

- [ ] **Step 2: Add `ImportRowError` and `ImportResult` schemas**

Append to `backend/app/schemas/item.py`:

```python
class ImportRowError(BaseModel):
    """Describes a single skipped row from an Excel import."""

    row: int = Field(description="1-based row number in the uploaded file (header = row 1).")
    reason: str = Field(description="Human-readable explanation of why the row was skipped.")


class ImportResult(BaseModel):
    """Summary returned after a bulk Excel item import."""

    imported: int = Field(description="Number of items successfully created.")
    skipped: int = Field(description="Number of rows skipped due to validation errors.")
    errors: list[ImportRowError] = Field(description="Details of each skipped row.")
```

- [ ] **Step 3: Write failing import test**

```python
# backend/tests/test_intakes.py — add this test

def test_import_items_from_excel(client, active_event, admin_token):
    """POST /intakes/{id}/items/import creates items from a valid xlsx file."""
    import io
    import openpyxl

    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json={"first_name": "A", "last_name": "B"}, headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    intake_id = intake_r.json()["id"]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Description", "Category", "Brand", "Type", "Color", "Size", "Gender/Age", "Year", "Price", "Used", "Donate if Unsold"])
    ws.append(["Atomic skis", "Skis", "Atomic", "Alpine", "Red", "160cm", "Men", 2020, 120.0, "Yes", "No"])
    ws.append(["Ski boots", "Boots", "Salomon", "", "", "10", "", None, 50.0, "Yes", "No"])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    r = client.post(
        f"/intakes/{intake_id}/items/import",
        files={"file": ("items.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["imported"] == 2
    assert body["skipped"] == 0

    # Verify items exist
    items_r = client.get(f"/sellers/{seller_r.json()['id']}/items", headers=headers)
    assert len(items_r.json()) == 2


def test_import_skips_rows_missing_price(client, active_event, admin_token):
    import io
    import openpyxl

    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json={"first_name": "A", "last_name": "B"}, headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    intake_id = intake_r.json()["id"]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Description", "Category", "Brand", "Type", "Color", "Size", "Gender/Age", "Year", "Price", "Used", "Donate if Unsold"])
    ws.append(["Good row", None, None, None, None, None, None, None, 30.0, "Yes", "No"])
    ws.append([None, None, None, None, None, None, None, None, None, "Yes", "No"])  # missing description AND price
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    r = client.post(
        f"/intakes/{intake_id}/items/import",
        files={"file": ("items.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["imported"] == 1
    assert body["skipped"] == 1
    assert body["errors"][0]["row"] == 3
```

- [ ] **Step 4: Run failing tests**

```bash
cd backend && pytest tests/test_intakes.py::test_import_items_from_excel tests/test_intakes.py::test_import_skips_rows_missing_price -v
```

Expected: FAIL (404 — endpoint does not exist)

- [ ] **Step 5: Add import endpoint to `intakes.py`**

Add these imports at the top of `intakes.py`:

```python
from io import BytesIO

import openpyxl
from fastapi import File, UploadFile

from app.schemas.item import ImportResult, ImportRowError
```

Add this function after `add_item_to_intake`:

```python
@router.post("/{intake_id}/items/import", response_model=ImportResult)
def import_items_from_excel(
    intake_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(_INTAKE_ADMIN),
):
    """Bulk-import items into an intake session from an Excel file using the standard template."""
    event = _active_event(db)
    intake = _get_intake_for_event(intake_id, event.id, db)
    seller = db.query(Seller).filter(Seller.id == intake.seller_id).first()

    wb = openpyxl.load_workbook(BytesIO(file.file.read()))
    ws = wb.active
    rows = list(ws.iter_rows(min_row=2, values_only=True))

    # Pre-compute starting sequence number to avoid per-row DB queries
    prefix = f"{seller.code}-"
    max_code = (
        db.query(func.max(Item.code))
        .join(Intake, Item.intake_id == Intake.id)
        .filter(Intake.seller_id == intake.seller_id, Item.code.like(f"{prefix}%"))
        .scalar()
    )
    next_seq = (int(max_code.split("-")[-1]) + 1) if max_code else 1

    errors: list[ImportRowError] = []
    imported = 0
    skipped = 0

    for i, row in enumerate(rows, start=2):
        padded = (list(row) + [None] * 11)[:11]
        description, category, brand, type_, color, size, gender_age, year, price, used_str, donate_str = padded

        if not description or price is None:
            errors.append(ImportRowError(row=i, reason="Missing required field: Description or Price"))
            skipped += 1
            continue

        try:
            price_float = float(price)
        except (TypeError, ValueError):
            errors.append(ImportRowError(row=i, reason=f"Invalid Price value: {price!r}"))
            skipped += 1
            continue

        item_code = f"{prefix}{next_seq:02d}"
        used = str(used_str).strip().lower() != "no" if used_str is not None else True
        donate = str(donate_str).strip().lower() == "yes" if donate_str is not None else False

        item = Item(
            intake_id=intake.id,
            seller_id=intake.seller_id,
            code=item_code,
            barcode_39=item_code,
            description=str(description),
            category=str(category) if category else None,
            brand=str(brand) if brand else None,
            type=str(type_) if type_ else None,
            color=str(color) if color else None,
            size=str(size) if size else None,
            gender_age=str(gender_age) if gender_age else None,
            year=int(year) if year is not None else None,
            price=price_float,
            used=used,
            donate_unsold=donate,
            created_by=current_user.username,
        )
        db.add(item)
        next_seq += 1
        imported += 1

    db.commit()
    return ImportResult(imported=imported, skipped=skipped, errors=errors)
```

- [ ] **Step 6: Add template download endpoint to `items.py`**

Add these imports to `items.py`:

```python
from io import BytesIO

import openpyxl
from fastapi.responses import StreamingResponse
```

Add this endpoint before `lookup_item`:

```python
@router.get("/import-template")
def download_import_template(_user: User = Depends(_INTAKE_ADMIN)):
    """Return a blank Excel template for bulk item import."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append([
        "Description", "Category", "Brand", "Type", "Color",
        "Size", "Gender/Age", "Year", "Price", "Used", "Donate if Unsold",
    ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=import-template.xlsx"},
    )
```

- [ ] **Step 7: Run all tests**

```bash
cd backend && pytest -v
```

Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add requirements.txt app/schemas/item.py app/routers/intakes.py app/routers/items.py tests/test_intakes.py
git commit -m "feat: Excel bulk import + template download endpoint"
```

---

## Task 5: Frontend — Update types.ts + API modules

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api/intakes.ts`
- Modify: `frontend/src/api/items.ts`
- Modify: `frontend/src/api/sellers.ts`

- [ ] **Step 1: Update `SellerCreate` in `types.ts` — remove `code`**

Find the `SellerCreate` interface and remove the `code` line:

```typescript
/** Payload for registering a new seller. */
export interface SellerCreate {
  /** Seller's first name. */
  first_name: string
  /** Seller's last name. */
  last_name: string
  /** Company name; omit for individual sellers. */
  company?: string
  /** Whether this seller is a vendor (business). Defaults to false. */
  is_vendor?: boolean
  /** Contact phone number. */
  phone?: string
  /** Contact email address. */
  email?: string
  /** Street address. */
  address?: string
  /** City. */
  city?: string
  /** State abbreviation. */
  state?: string
  /** ZIP code. */
  zip?: string
}
```

- [ ] **Step 2: Update `ItemCreate` in `types.ts` — remove `code`**

Find the `ItemCreate` interface. Remove the `code` field. The updated interface starts with:

```typescript
/** Payload for adding a consignment item to an intake session. Item code is auto-generated. */
export interface ItemCreate {
  category?: string
  brand?: string
  type?: string
  description?: string
  color?: string
  size?: string
  uom?: string
  gender_age?: string
  year?: number
  used?: boolean
  price: number
  quantity?: number
  barcode_39?: string
  label_line_2?: string
  label_line_3?: string
  donate_unsold?: boolean
  vendor_item_id?: string
}
```

- [ ] **Step 3: Add `ImportResult` to `types.ts`**

Add after the existing `Item` interfaces:

```typescript
/** A single skipped row from an Excel import. */
export interface ImportRowError {
  /** 1-based row number in the uploaded file. */
  row: number
  /** Why this row was skipped. */
  reason: string
}

/** Summary returned after a bulk Excel item import. */
export interface ImportResult {
  /** Number of items successfully created. */
  imported: number
  /** Number of rows that were skipped. */
  skipped: number
  /** Details for each skipped row. */
  errors: ImportRowError[]
}
```

- [ ] **Step 4: Add `importItems` to `api/intakes.ts`**

Add this function and import at the top:

```typescript
import type { Intake, IntakeWithItems, IntakeCreate, IntakeUpdate, Item, ItemCreate, ImportResult } from '../types'
```

```typescript
/**
 * Bulk-import items into an intake session from an Excel file.
 *
 * @param intakeId - Primary key of the intake to import into.
 * @param file - The .xlsx file using the standard import template.
 * @returns Import summary with counts and any row-level errors.
 */
export async function importItems(intakeId: number, file: File): Promise<ImportResult> {
  const form = new FormData()
  form.append('file', file)
  // Use raw fetch — apiFetch serialises JSON; multipart requires FormData
  const token = localStorage.getItem('token')
  const res = await fetch(`/api/intakes/${intakeId}/items/import`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) throw new Error(`Import failed: ${res.statusText}`)
  return res.json() as Promise<ImportResult>
}
```

> **Note:** `importItems` uses `fetch` directly because `apiFetch` serialises JSON and multipart requires raw FormData.

- [ ] **Step 5: Add `downloadImportTemplate` to `api/items.ts`**

```typescript
/**
 * Trigger a download of the blank Excel import template.
 * Opens the file in the browser's native download handler.
 */
export function downloadImportTemplate(): void {
  const token = localStorage.getItem('token')
  fetch('/api/items/import-template', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(r => r.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'import-template.xlsx'
      link.click()
      URL.revokeObjectURL(url)
    })
}
```

- [ ] **Step 6: Add `listSellerItems` to `api/sellers.ts`**

```typescript
import type { Seller, SellerCreate, SellerUpdate, Item } from '../types'

/**
 * List all items for a seller in the active event.
 *
 * @param sellerId - Primary key of the seller.
 * @returns Array of Item records ordered by item code.
 */
export const listSellerItems = (sellerId: number) =>
  apiFetch<Item[]>(`/sellers/${sellerId}/items`)
```

- [ ] **Step 7: Run frontend tests**

```bash
cd frontend && ./node_modules/.bin/vitest run
```

Expected: all pass (these are type-only changes — existing tests should still pass)

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/api/intakes.ts src/api/items.ts src/api/sellers.ts
git commit -m "feat: update types and API modules for auto-codes, import, seller items"
```

---

## Task 6: Frontend — SellerCombobox shared component

**Files:**
- Create: `frontend/src/components/SellerCombobox.tsx`
- Create: `frontend/src/components/SellerCombobox.test.tsx`
- Modify: `frontend/src/mocks/handlers.ts`

- [ ] **Step 1: Add MSW handler for seller search (if not already present)**

In `frontend/src/mocks/handlers.ts`, confirm there is a `GET /sellers` handler. Add one if missing:

```typescript
http.get('/api/sellers', ({ request }) => {
  const url = new URL(request.url)
  const q = url.searchParams.get('q') ?? ''
  const sellers = [
    { id: 1, code: '001', first_name: 'Jane', last_name: 'Smith', company: null,
      is_vendor: false, phone: null, email: null, address: null, city: null,
      state: null, zip: null, event_id: 1, created_at: '2026-01-01T00:00:00Z' },
  ].filter(s =>
    s.code.includes(q) || s.first_name.toLowerCase().includes(q.toLowerCase()) ||
    s.last_name.toLowerCase().includes(q.toLowerCase())
  )
  return HttpResponse.json(sellers)
}),
```

- [ ] **Step 2: Write failing tests**

```typescript
// frontend/src/components/SellerCombobox.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SellerCombobox } from './SellerCombobox'
import { server } from '../mocks/server'

describe('SellerCombobox', () => {
  it('renders an empty input', () => {
    render(<SellerCombobox onSelect={vi.fn()} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('shows matching sellers in dropdown after typing', async () => {
    render(<SellerCombobox onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Jane' } })
    await waitFor(() => expect(screen.getByText(/Jane Smith/)).toBeInTheDocument())
  })

  it('calls onSelect with the seller when an option is clicked', async () => {
    const onSelect = vi.fn()
    render(<SellerCombobox onSelect={onSelect} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Jane' } })
    await waitFor(() => screen.getByText(/Jane Smith/))
    fireEvent.click(screen.getByText(/Jane Smith/))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 1, code: '001' }))
  })

  it('shows selected seller name in input after selection', async () => {
    render(<SellerCombobox onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Jane' } })
    await waitFor(() => screen.getByText(/Jane Smith/))
    fireEvent.click(screen.getByText(/Jane Smith/))
    expect(screen.getByRole('combobox')).toHaveValue('001 — Jane Smith')
  })

  it('clears selection when × is clicked', async () => {
    render(<SellerCombobox onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Jane' } })
    await waitFor(() => screen.getByText(/Jane Smith/))
    fireEvent.click(screen.getByText(/Jane Smith/))
    fireEvent.click(screen.getByRole('button', { name: '×' }))
    expect(screen.getByRole('combobox')).toHaveValue('')
  })
})
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
cd frontend && ./node_modules/.bin/vitest run src/components/SellerCombobox.test.tsx
```

Expected: FAIL (module not found)

- [ ] **Step 4: Implement `SellerCombobox`**

```typescript
// frontend/src/components/SellerCombobox.tsx
import { useState, useRef, useEffect } from 'react'
import { searchSellers } from '../api/sellers'
import type { Seller } from '../types'

const NAVY = '#1e3a8a'

/**
 * Searchable seller combobox — debounced live search against the sellers API.
 * Shows a dropdown of matching sellers; on selection the seller is passed to onSelect.
 */
export function SellerCombobox({
  onSelect,
  placeholder = 'Search by name or code...',
}: {
  onSelect: (seller: Seller) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Seller[]>([])
  const [selected, setSelected] = useState<Seller | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed || selected) {
      setResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const matches = await searchSellers(trimmed)
        setResults(matches.slice(0, 10))
      } catch {
        setResults([])
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, selected])

  function handleSelect(seller: Seller) {
    setSelected(seller)
    setQuery(`${seller.code} — ${seller.first_name} ${seller.last_name}`)
    setResults([])
    onSelect(seller)
  }

  function handleClear() {
    setSelected(null)
    setQuery('')
    setResults([])
  }

  return (
    <div style={{ position: 'relative', display: 'flex', gap: 4, alignItems: 'center' }}>
      <input
        role="combobox"
        aria-expanded={results.length > 0}
        value={query}
        onChange={e => { setQuery(e.target.value); setSelected(null) }}
        placeholder={placeholder}
        style={{ flex: 1, padding: '6px 10px', border: `1px solid ${NAVY}`, borderRadius: 4 }}
        autoComplete="off"
      />
      {selected && (
        <button type="button" onClick={handleClear} aria-label="×" style={{ padding: '4px 8px' }}>×</button>
      )}
      {results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.10)', maxHeight: 240, overflowY: 'auto',
        }}>
          {results.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSelect(s)}
              style={{
                display: 'block', width: '100%', padding: '8px 12px',
                textAlign: 'left', border: 'none', background: 'none',
                borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 14,
              }}
            >
              <strong style={{ color: NAVY }}>{s.code}</strong>
              {' — '}{s.first_name} {s.last_name}
              {s.company && <span style={{ color: '#64748b', marginLeft: 6 }}>({s.company})</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd frontend && ./node_modules/.bin/vitest run src/components/SellerCombobox.test.tsx
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/components/SellerCombobox.tsx src/components/SellerCombobox.test.tsx src/mocks/handlers.ts
git commit -m "feat: add SellerCombobox shared search component"
```

---

## Task 7: Frontend — Update SellerForm (remove code, add address)

**Files:**
- Modify: `frontend/src/intake/SellerForm.tsx`
- Modify: `frontend/src/intake/SellerForm.test.tsx`

- [ ] **Step 1: Update SellerForm tests**

In `SellerForm.test.tsx`:
- Remove any test that fills in or asserts the seller code input
- Add tests for the address fields:

```typescript
it('renders address fields', () => {
  render(<SellerForm onCreated={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getByLabelText(/street address/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/city/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/state/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/zip/i)).toBeInTheDocument()
})

it('submits without code and includes address', async () => {
  const onCreated = vi.fn()
  render(<SellerForm onCreated={onCreated} onCancel={vi.fn()} />)
  fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Jane' } })
  fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Smith' } })
  fireEvent.change(screen.getByLabelText(/street address/i), { target: { value: '123 Main St' } })
  fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'Minneapolis' } })
  fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'MN' } })
  fireEvent.change(screen.getByLabelText(/zip/i), { target: { value: '55401' } })
  fireEvent.submit(screen.getByRole('button', { name: /register/i }).closest('form')!)
  await waitFor(() => expect(onCreated).toHaveBeenCalled())
})
```

Also update the MSW `POST /sellers` handler in `handlers.ts` to return a seller without requiring `code` in the request body:

```typescript
http.post('/api/sellers', async ({ request }) => {
  const body = await request.json() as Record<string, unknown>
  return HttpResponse.json({
    id: 1, code: '001',
    first_name: body.first_name ?? 'Jane',
    last_name: body.last_name ?? 'Smith',
    company: body.company ?? null,
    is_vendor: body.is_vendor ?? false,
    phone: body.phone ?? null,
    email: body.email ?? null,
    address: body.address ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    zip: body.zip ?? null,
    event_id: 1,
    created_at: '2026-01-01T00:00:00Z',
  }, { status: 201 })
}),
```

- [ ] **Step 2: Run tests — verify the code-field test is gone and address tests fail**

```bash
cd frontend && ./node_modules/.bin/vitest run src/intake/SellerForm.test.tsx
```

Expected: address tests FAIL (fields not rendered yet)

- [ ] **Step 3: Update `SellerForm.tsx`**

```typescript
// frontend/src/intake/SellerForm.tsx
import { useState, type FormEvent } from 'react'
import { createSeller } from '../api/sellers'
import type { Seller } from '../types'

export function SellerForm({ onCreated, onCancel }: {
  onCreated: (seller: Seller) => void
  onCancel: () => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [isVendor, setIsVendor] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const seller = await createSeller({
        first_name: firstName,
        last_name: lastName,
        company: company || undefined,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        city: city || undefined,
        state: state || undefined,
        zip: zip || undefined,
        is_vendor: isVendor,
      })
      onCreated(seller)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register seller')
    } finally {
      setLoading(false)
    }
  }

  const field = (id: string, label: string, value: string, onChange: (v: string) => void, required = false) => (
    <div style={{ marginBottom: 10 }}>
      <label htmlFor={id} style={{ display: 'block', marginBottom: 3 }}>{label}</label>
      <input id={id} value={value} onChange={e => onChange(e.target.value)} required={required}
        style={{ width: '100%', padding: 6, boxSizing: 'border-box' }} />
    </div>
  )

  return (
    <form onSubmit={handleSubmit}>
      <h3>Register New Seller</h3>
      {field('firstName', 'First Name', firstName, setFirstName, true)}
      {field('lastName', 'Last Name', lastName, setLastName, true)}
      {field('company', 'Company (optional)', company, setCompany)}
      {field('phone', 'Phone (optional)', phone, setPhone)}
      {field('email', 'Email (optional)', email, setEmail)}
      <div style={{ marginBottom: 10 }}>
        <label>
          <input type="checkbox" checked={isVendor} onChange={e => setIsVendor(e.target.checked)} />
          {' '}Vendor (not individual consignor)
        </label>
      </div>
      <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: 4, padding: '10px 12px', marginBottom: 10 }}>
        <legend style={{ fontSize: 13, color: '#64748b' }}>Address (optional)</legend>
        {field('address', 'Street Address', address, setAddress)}
        {field('city', 'City', city, setCity)}
        {field('state', 'State', state, setState)}
        {field('zip', 'ZIP', zip, setZip)}
      </fieldset>
      {error && <div role="alert" style={{ color: 'red', marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={loading}>Register</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd frontend && ./node_modules/.bin/vitest run src/intake/SellerForm.test.tsx
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/intake/SellerForm.tsx src/intake/SellerForm.test.tsx src/mocks/handlers.ts
git commit -m "feat: remove seller code field from SellerForm; add address fields"
```

---

## Task 8: Frontend — Update ItemForm (remove code field)

**Files:**
- Modify: `frontend/src/intake/ItemForm.tsx`
- Modify: `frontend/src/intake/ItemForm.test.tsx`

- [ ] **Step 1: Update ItemForm tests**

In `ItemForm.test.tsx`, remove any test that fills in or asserts on a code input field. Verify the remaining tests still describe the required fields (price, description, etc.).

Also update the MSW `POST /intakes/:id/items` handler in `handlers.ts` to return an item with auto-generated code and not require `code` in the request body:

```typescript
http.post('/api/intakes/:intakeId/items', async ({ request }) => {
  const body = await request.json() as Record<string, unknown>
  return HttpResponse.json({
    id: 1, intake_id: 1, seller_id: 1,
    code: '001-01',
    category: body.category ?? null,
    brand: body.brand ?? null,
    type: body.type ?? null,
    description: body.description ?? null,
    color: body.color ?? null,
    size: body.size ?? null,
    uom: body.uom ?? null,
    gender_age: body.gender_age ?? null,
    year: body.year ?? null,
    used: body.used ?? true,
    price: body.price ?? 0,
    quantity: body.quantity ?? 1,
    barcode_39: '001-01',
    label_line_2: null, label_line_3: null,
    donate_unsold: body.donate_unsold ?? false,
    status: 'available',
    label_printed: false,
    vendor_item_id: null,
    created_at: '2026-01-01T00:00:00Z',
  }, { status: 201 })
}),
```

- [ ] **Step 2: Run tests — verify existing tests still pass without code field**

```bash
cd frontend && ./node_modules/.bin/vitest run src/intake/ItemForm.test.tsx
```

- [ ] **Step 3: Remove code field from `ItemForm.tsx`**

Open `frontend/src/intake/ItemForm.tsx`. Find the `code` state variable and its `<input>` element. Remove both. The form should open with `price` as the first required field.

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd frontend && ./node_modules/.bin/vitest run src/intake/ItemForm.test.tsx
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/intake/ItemForm.tsx src/intake/ItemForm.test.tsx src/mocks/handlers.ts
git commit -m "feat: remove item code field from ItemForm (now auto-generated)"
```

---

## Task 9: Frontend — Update ReportsPage (seller combobox + line items table)

**Files:**
- Modify: `frontend/src/admin/ReportsPage.tsx`
- Modify: `frontend/src/admin/ReportsPage.test.tsx`

- [ ] **Step 1: Update ReportsPage tests**

In `ReportsPage.test.tsx`, find the test that renders the seller ID number input and update it:

```typescript
it('renders seller combobox for payout lookup', () => {
  render(<ReportsPage eventId={1} />)
  expect(screen.getByRole('combobox')).toBeInTheDocument()
})

it('shows payout and line items table when seller selected', async () => {
  render(<ReportsPage eventId={1} />)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Jane' } })
  await waitFor(() => screen.getByText(/Jane Smith/))
  fireEvent.click(screen.getByText(/Jane Smith/))
  fireEvent.submit(screen.getByRole('button', { name: /get payout/i }).closest('form')!)
  await waitFor(() => expect(screen.getByText(/Seller Payout/i)).toBeInTheDocument())
  // Line items table
  await waitFor(() => expect(screen.getByText(/Item Code/i)).toBeInTheDocument())
})
```

Update the MSW handler for `GET /reports/:eventId/seller/:sellerId` to include `line_items`:

```typescript
http.get('/api/reports/:eventId/seller/:sellerId', () =>
  HttpResponse.json({
    event_id: 1, event_name: 'Swap 2026',
    seller_id: 1, seller_code: '001', seller_name: 'Jane Smith',
    seller_email: null,
    items_consigned: 2, items_sold: 1, items_unsold: 1, items_donated: 0,
    gross_sales: 120.0, mysl_total: 36.0, seller_total: 84.0,
    line_items: [
      { item_code: '001-01', description: 'Atomic skis', price: 120.0, sell_price: 120.0, status: 'sold' },
      { item_code: '001-02', description: 'Boots', price: 40.0, sell_price: 0.0, status: 'unsold' },
    ],
    generated_at: '2026-04-11T00:00:00Z',
  })
),
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
cd frontend && ./node_modules/.bin/vitest run src/admin/ReportsPage.test.tsx
```

- [ ] **Step 3: Update `ReportsPage.tsx`**

Replace the Seller Payout section (lines 154–199 in the current file):

```typescript
// Add to imports at top
import { SellerCombobox } from '../components/SellerCombobox'
import type { EventRevenueReport, DonationsReport, UnsoldItemsReport, SellerPayoutReport, Seller } from '../types'

// Replace state
const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null)
const [payout, setPayout] = useState<SellerPayoutReport | null>(null)
const [payoutError, setPayoutError] = useState<string | null>(null)

// Replace handlePayoutLookup
async function handlePayoutLookup(e: FormEvent) {
  e.preventDefault()
  if (!selectedSeller) return
  setPayoutError(null)
  setPayout(null)
  try {
    const data = await getSellerPayout(eventId, selectedSeller.id)
    setPayout(data)
  } catch (err) {
    setPayoutError(err instanceof Error ? err.message : 'Failed to load payout')
  }
}
```

Replace the Seller Payout JSX section:

```tsx
{/* Seller Payout Lookup */}
<section style={{ marginBottom: 32 }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <h3>Seller Payout</h3>
    {payout && (
      <button onClick={() => downloadFile(`/reports/${eventId}/seller/${payout.seller_id}?format=csv`, `payout-${payout.seller_code}.csv`)}>
        Download CSV
      </button>
    )}
  </div>
  <form onSubmit={handlePayoutLookup} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}>
    <div style={{ flex: 1 }}>
      <label style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>Seller</label>
      <SellerCombobox onSelect={setSelectedSeller} placeholder="Search by name or code..." />
    </div>
    <button type="submit" disabled={!selectedSeller}>Get Payout</button>
  </form>
  {payoutError && <div role="alert" style={{ color: 'red' }}>{payoutError}</div>}
  {payout && (
    <div>
      <p><strong>{payout.seller_name}</strong> ({payout.seller_code})</p>
      <table style={{ borderCollapse: 'collapse', marginBottom: 16 }}>
        <tbody>
          {[
            ['Items Consigned', String(payout.items_consigned)],
            ['Items Sold', String(payout.items_sold)],
            ['Items Unsold', String(payout.items_unsold)],
            ['Gross Sales', `$${payout.gross_sales.toFixed(2)}`],
            ['MYSL Total', `$${payout.mysl_total.toFixed(2)}`],
            ['Seller Payout', `$${payout.seller_total.toFixed(2)}`],
          ].map(([label, val]) => (
            <tr key={label} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '4px 16px 4px 8px', fontWeight: 'bold' }}>{label}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right' }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {payout.line_items.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ccc' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Item Code</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Description</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Status</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>Ask Price</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>Sold Price</th>
            </tr>
          </thead>
          <tbody>
            {payout.line_items.map(li => (
              <tr key={li.item_code} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '4px 8px' }}>{li.item_code}</td>
                <td style={{ padding: '4px 8px' }}>{li.description ?? '—'}</td>
                <td style={{ padding: '4px 8px' }}>{li.status}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>${li.price.toFixed(2)}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                  {li.status === 'sold' ? `$${li.sell_price.toFixed(2)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )}
</section>
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd frontend && ./node_modules/.bin/vitest run src/admin/ReportsPage.test.tsx
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/admin/ReportsPage.tsx src/admin/ReportsPage.test.tsx src/mocks/handlers.ts
git commit -m "feat: replace seller ID input with SellerCombobox in reports; add line items table"
```

---

## Task 10: Frontend — SellerListPage

**Files:**
- Create: `frontend/src/admin/SellerListPage.tsx`
- Create: `frontend/src/admin/SellerListPage.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// frontend/src/admin/SellerListPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SellerListPage } from './SellerListPage'

describe('SellerListPage', () => {
  it('renders seller list', async () => {
    render(<SellerListPage onSelectSeller={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Jane Smith')).toBeInTheDocument())
    expect(screen.getByText('001')).toBeInTheDocument()
  })

  it('renders search input with helpful label', () => {
    render(<SellerListPage onSelectSeller={vi.fn()} />)
    expect(screen.getByPlaceholderText(/search by name or code/i)).toBeInTheDocument()
  })

  it('calls onSelectSeller when View is clicked', async () => {
    const onSelectSeller = vi.fn()
    render(<SellerListPage onSelectSeller={onSelectSeller} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    fireEvent.click(screen.getByRole('button', { name: /view/i }))
    expect(onSelectSeller).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('renders Register New Seller button', () => {
    render(<SellerListPage onSelectSeller={vi.fn()} />)
    expect(screen.getByRole('button', { name: /register new seller/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd frontend && ./node_modules/.bin/vitest run src/admin/SellerListPage.test.tsx
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement `SellerListPage`**

```typescript
// frontend/src/admin/SellerListPage.tsx
import { useState, useEffect } from 'react'
import { searchSellers } from '../api/sellers'
import { SellerForm } from '../intake/SellerForm'
import type { Seller } from '../types'

const NAVY = '#1e3a8a'

/**
 * Admin seller list page — debounced search, tabular display, drill-in navigation.
 * Rendered inside the Sellers tab of AdminPage.
 */
export function SellerListPage({ onSelectSeller }: { onSelectSeller: (seller: Seller) => void }) {
  const [query, setQuery] = useState('')
  const [sellers, setSellers] = useState<Seller[]>([])
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      searchSellers(query).then(setSellers).catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  function handleCreated(seller: Seller) {
    setShowCreate(false)
    setSellers(prev => [...prev, seller].sort((a, b) => a.code.localeCompare(b.code)))
  }

  if (showCreate) {
    return <SellerForm onCreated={handleCreated} onCancel={() => setShowCreate(false)} />
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Sellers</h3>
        <button onClick={() => setShowCreate(true)} style={{ background: NAVY, color: '#fff', border: 'none', padding: '6px 14px', cursor: 'pointer', borderRadius: 4 }}>
          Register New Seller
        </button>
      </div>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by name or code..."
        style={{ width: '100%', padding: '8px 10px', marginBottom: 12, border: `1px solid ${NAVY}`, borderRadius: 4, boxSizing: 'border-box' }}
      />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            {['Code', 'Name', 'Phone', 'Email', ''].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sellers.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '8px 10px', fontWeight: 600, color: NAVY }}>{s.code}</td>
              <td style={{ padding: '8px 10px' }}>{s.first_name} {s.last_name}{s.company ? ` (${s.company})` : ''}</td>
              <td style={{ padding: '8px 10px', color: '#64748b' }}>{s.phone ?? '—'}</td>
              <td style={{ padding: '8px 10px', color: '#64748b' }}>{s.email ?? '—'}</td>
              <td style={{ padding: '8px 10px' }}>
                <button
                  onClick={() => onSelectSeller(s)}
                  style={{ border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '3px 10px', cursor: 'pointer', borderRadius: 3 }}
                >
                  View →
                </button>
              </td>
            </tr>
          ))}
          {sellers.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>No sellers found</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd frontend && ./node_modules/.bin/vitest run src/admin/SellerListPage.test.tsx
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/admin/SellerListPage.tsx src/admin/SellerListPage.test.tsx
git commit -m "feat: add SellerListPage admin component"
```

---

## Task 11: Frontend — SellerDetailPage

**Files:**
- Create: `frontend/src/admin/SellerDetailPage.tsx`
- Create: `frontend/src/admin/SellerDetailPage.test.tsx`
- Modify: `frontend/src/mocks/handlers.ts`

- [ ] **Step 1: Add MSW handlers for new routes**

In `handlers.ts` add:

```typescript
// GET /sellers/:id/items
http.get('/api/sellers/:sellerId/items', () =>
  HttpResponse.json([
    {
      id: 1, intake_id: 1, seller_id: 1, code: '001-01',
      category: 'Skis', brand: 'Atomic', type: null, description: 'Atomic skis 160cm',
      color: 'Red', size: '160cm', uom: null, gender_age: 'Men', year: 2020,
      used: true, price: 120.0, quantity: 1, barcode_39: '001-01',
      label_line_2: null, label_line_3: null, donate_unsold: false,
      status: 'available', label_printed: false, vendor_item_id: null,
      created_at: '2026-01-01T00:00:00Z',
    },
  ])
),

// GET /sellers/:id/intakes (already in handlers if getSellerIntakes exists, else add)
http.get('/api/sellers/:sellerId/intakes', () =>
  HttpResponse.json([
    { id: 1, seller_id: 1, date_entered: '2026-01-01', date_received: null,
      donate_unsold: false, donate_proceeds: false, created_by: 'admin',
      created_at: '2026-01-01T00:00:00Z', items: [] },
  ])
),

// POST /intakes/:id/items/import
http.post('/api/intakes/:intakeId/items/import', () =>
  HttpResponse.json({ imported: 2, skipped: 0, errors: [] })
),
```

- [ ] **Step 2: Write failing tests**

```typescript
// frontend/src/admin/SellerDetailPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SellerDetailPage } from './SellerDetailPage'

const seller = {
  id: 1, code: '001', first_name: 'Jane', last_name: 'Smith',
  company: null, is_vendor: false, phone: '612-555-0101', email: 'jane@example.com',
  address: '123 Main St', city: 'Minneapolis', state: 'MN', zip: '55401',
  event_id: 1, created_at: '2026-01-01T00:00:00Z',
}

describe('SellerDetailPage', () => {
  it('renders seller contact info', async () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} />)
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    expect(screen.getByText('612-555-0101')).toBeInTheDocument()
    expect(screen.getByText('jane@example.com')).toBeInTheDocument()
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument()
  })

  it('renders items table with item from API', async () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('001-01')).toBeInTheDocument())
    expect(screen.getByText('Atomic skis 160cm')).toBeInTheDocument()
  })

  it('calls onBack when Back button is clicked', () => {
    const onBack = vi.fn()
    render(<SellerDetailPage seller={seller} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows Add Item button', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument()
  })

  it('shows Import from Excel button', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: /import from excel/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
cd frontend && ./node_modules/.bin/vitest run src/admin/SellerDetailPage.test.tsx
```

Expected: FAIL (module not found)

- [ ] **Step 4: Implement `SellerDetailPage`**

```typescript
// frontend/src/admin/SellerDetailPage.tsx
import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { updateSeller, listSellerItems } from '../api/sellers'
import { getSellerIntakes, createIntake, importItems } from '../api/intakes'
import { updateItem, deleteItem, downloadImportTemplate } from '../api/items'
import { ItemForm } from '../intake/ItemForm'
import type { Seller, Item, Intake, ImportResult } from '../types'

const NAVY = '#1e3a8a'

/**
 * Admin seller detail page — contact card with inline edit, items table,
 * Add Item form, and Excel import.
 */
export function SellerDetailPage({ seller: initialSeller, onBack }: {
  seller: Seller
  onBack: () => void
}) {
  const [seller, setSeller] = useState<Seller>(initialSeller)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<Seller>(initialSeller)
  const [items, setItems] = useState<Item[]>([])
  const [showAddItem, setShowAddItem] = useState(false)
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [intakes, setIntakes] = useState<Intake[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listSellerItems(seller.id).then(setItems).catch(() => {})
    getSellerIntakes(seller.id).then(setIntakes).catch(() => {})
  }, [seller.id])

  async function handleSaveEdit() {
    const updated = await updateSeller(seller.id, {
      first_name: editDraft.first_name, last_name: editDraft.last_name,
      company: editDraft.company ?? undefined, phone: editDraft.phone ?? undefined,
      email: editDraft.email ?? undefined, address: editDraft.address ?? undefined,
      city: editDraft.city ?? undefined, state: editDraft.state ?? undefined,
      zip: editDraft.zip ?? undefined,
    })
    setSeller(updated)
    setEditing(false)
  }

  async function handleDeleteItem(itemId: number) {
    await deleteItem(itemId)
    setItems(prev => prev.filter(i => i.id !== itemId))
  }

  async function getOrCreateIntakeId(): Promise<number> {
    if (intakes.length > 0) return intakes[0].id
    const intake = await createIntake({ seller_id: seller.id })
    setIntakes([intake])
    return intake.id
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const intakeId = await getOrCreateIntakeId()
    const result = await importItems(intakeId, file)
    setImportResult(result)
    if (result.imported > 0) {
      listSellerItems(seller.id).then(setItems).catch(() => {})
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const contactField = (label: string, value: string | null) => (
    <div style={{ marginBottom: 4 }}>
      <span style={{ color: '#64748b', fontSize: 13, marginRight: 6 }}>{label}:</span>
      <span>{value ?? '—'}</span>
    </div>
  )

  return (
    <div>
      {/* Back + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{ border: 'none', background: 'none', color: NAVY, cursor: 'pointer', fontSize: 14 }}>
          ← Back
        </button>
        <h3 style={{ margin: 0 }}>
          <span style={{ color: NAVY, marginRight: 8 }}>{seller.code}</span>
          {seller.first_name} {seller.last_name}
          {seller.company && <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 8 }}>({seller.company})</span>}
        </h3>
      </div>

      {/* Contact card */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 16, marginBottom: 20 }}>
        {!editing ? (
          <>
            {contactField('Phone', seller.phone)}
            {contactField('Email', seller.email)}
            {contactField('Address', seller.address
              ? `${seller.address}, ${seller.city ?? ''} ${seller.state ?? ''} ${seller.zip ?? ''}`.trim()
              : null)}
            <button onClick={() => { setEditDraft(seller); setEditing(true) }}
              style={{ marginTop: 8, border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '4px 12px', cursor: 'pointer', borderRadius: 3 }}>
              Edit
            </button>
          </>
        ) : (
          <div>
            {(['first_name', 'last_name', 'phone', 'email', 'address', 'city', 'state', 'zip'] as const).map(f => (
              <div key={f} style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>{f.replace('_', ' ')}</label>
                <input
                  value={(editDraft[f] as string) ?? ''}
                  onChange={e => setEditDraft(prev => ({ ...prev, [f]: e.target.value }))}
                  style={{ width: '100%', padding: '5px 8px', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={handleSaveEdit} style={{ background: NAVY, color: '#fff', border: 'none', padding: '5px 14px', cursor: 'pointer', borderRadius: 3 }}>Save</button>
              <button onClick={() => setEditing(false)} style={{ border: '1px solid #94a3b8', background: 'none', padding: '5px 14px', cursor: 'pointer', borderRadius: 3 }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Items table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0 }}>Items ({items.length})</h4>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => downloadImportTemplate()} style={{ border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '4px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}>
            Download Template
          </button>
          <button onClick={() => fileInputRef.current?.click()} style={{ border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '4px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}>
            Import from Excel
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleImportFile} />
          <button onClick={() => setShowAddItem(true)} style={{ background: NAVY, color: '#fff', border: 'none', padding: '4px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}>
            + Add Item
          </button>
        </div>
      </div>

      {importResult && (
        <div style={{ background: importResult.skipped > 0 ? '#fef3c7' : '#f0fdf4', border: '1px solid', borderColor: importResult.skipped > 0 ? '#fcd34d' : '#86efac', borderRadius: 4, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>
          Imported {importResult.imported} item{importResult.imported !== 1 ? 's' : ''}.
          {importResult.skipped > 0 && ` Skipped ${importResult.skipped} row${importResult.skipped !== 1 ? 's' : ''}: ${importResult.errors.map(e => `row ${e.row}: ${e.reason}`).join('; ')}`}
          <button onClick={() => setImportResult(null)} style={{ marginLeft: 8, border: 'none', background: 'none', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {showAddItem && (
        <div style={{ marginBottom: 16, padding: 16, border: '1px solid #e2e8f0', borderRadius: 6 }}>
          <ItemForm
            intakeId={intakes[0]?.id ?? 0}
            sellerCode={seller.code}
            onAdded={item => { setItems(prev => [...prev, item]); setShowAddItem(false) }}
            onCancel={() => setShowAddItem(false)}
          />
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            {['Code', 'Description', 'Category', 'Price', 'Status', ''].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 13 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '7px 8px', fontFamily: 'monospace', color: NAVY }}>{item.code}</td>
              <td style={{ padding: '7px 8px' }}>{item.description ?? '—'}</td>
              <td style={{ padding: '7px 8px', color: '#64748b' }}>{item.category ?? '—'}</td>
              <td style={{ padding: '7px 8px' }}>${item.price.toFixed(2)}</td>
              <td style={{ padding: '7px 8px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: item.status === 'sold' ? '#16a34a' : '#64748b' }}>
                  {item.status}
                </span>
              </td>
              <td style={{ padding: '7px 8px' }}>
                <button onClick={() => setEditingItemId(item.id)}
                  style={{ border: 'none', background: 'none', color: NAVY, cursor: 'pointer', marginRight: 8, fontSize: 13 }}>
                  Edit
                </button>
                {!item.label_printed && item.status === 'available' && (
                  <button onClick={() => handleDeleteItem(item.id)}
                    style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}>
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>No items yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

> **Note:** `ItemForm` currently takes `intakeId` and `sellerCode` as props to create an item. Verify those prop names match `ItemForm.tsx`'s actual interface — adjust if different.

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd frontend && ./node_modules/.bin/vitest run src/admin/SellerDetailPage.test.tsx
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/admin/SellerDetailPage.tsx src/admin/SellerDetailPage.test.tsx src/mocks/handlers.ts
git commit -m "feat: add SellerDetailPage with contact edit, items table, and Excel import"
```

---

## Task 12: Frontend — Wire Sellers tab into AdminPage

**Files:**
- Modify: `frontend/src/admin/AdminPage.tsx`
- Modify: `frontend/src/admin/AdminPage.test.tsx`

- [ ] **Step 1: Update AdminPage test**

In `AdminPage.test.tsx`, add:

```typescript
it('renders Sellers tab button', () => {
  render(<AdminPage />)
  expect(screen.getByRole('button', { name: 'Sellers' })).toBeInTheDocument()
})

it('shows SellerListPage when Sellers tab is clicked', async () => {
  render(<AdminPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Sellers' }))
  await waitFor(() => expect(screen.getByText(/Jane Smith/)).toBeInTheDocument())
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd frontend && ./node_modules/.bin/vitest run src/admin/AdminPage.test.tsx
```

Expected: FAIL (Sellers tab not found)

- [ ] **Step 3: Update `AdminPage.tsx`**

```typescript
// frontend/src/admin/AdminPage.tsx
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { EventSetup } from './EventSetup'
import { UserManagement } from './UserManagement'
import { ReportsPage } from './ReportsPage'
import { EndOfDayPage } from './EndOfDayPage'
import { SellerListPage } from './SellerListPage'
import { SellerDetailPage } from './SellerDetailPage'
import type { Seller } from '../types'

type AdminSection = 'events' | 'users' | 'reports' | 'eod' | 'sellers'

const SECTIONS: { key: AdminSection; label: string }[] = [
  { key: 'events', label: 'Event Setup' },
  { key: 'users', label: 'Users' },
  { key: 'sellers', label: 'Sellers' },
  { key: 'reports', label: 'Reports' },
  { key: 'eod', label: 'End of Day' },
]

/** SellersSection manages its own list↔detail navigation state. */
function SellersSection() {
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null)
  if (selectedSeller) {
    return <SellerDetailPage seller={selectedSeller} onBack={() => setSelectedSeller(null)} />
  }
  return <SellerListPage onSelectSeller={setSelectedSeller} />
}

export function AdminPage() {
  const { decoded } = useAuth()
  const eventId = decoded?.event_id ?? 1
  const [section, setSection] = useState<AdminSection>('events')

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #1a237e', paddingBottom: 8 }}>
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            aria-current={section === s.key ? 'page' : undefined}
            style={{
              padding: '6px 16px',
              background: section === s.key ? '#1a237e' : 'transparent',
              color: section === s.key ? 'white' : '#1a237e',
              border: '1px solid #1a237e',
              cursor: 'pointer',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'events' && <EventSetup />}
      {section === 'users' && <UserManagement />}
      {section === 'sellers' && <SellersSection />}
      {section === 'reports' && <ReportsPage eventId={eventId} />}
      {section === 'eod' && <EndOfDayPage eventId={eventId} />}
    </div>
  )
}
```

- [ ] **Step 4: Run all frontend tests**

```bash
cd frontend && ./node_modules/.bin/vitest run
```

Expected: all 17 test files pass

- [ ] **Step 5: Commit**

```bash
git add src/admin/AdminPage.tsx src/admin/AdminPage.test.tsx
git commit -m "feat: add Sellers tab to AdminPage"
```

---

## Final verification

- [ ] **Run full backend test suite**

```bash
cd backend && pytest -v
```

Expected: all pass

- [ ] **Run full frontend test suite**

```bash
cd frontend && ./node_modules/.bin/vitest run
```

Expected: all pass

- [ ] **Manual smoke test checklist**

1. Start the app (`./start.sh`)
2. Log in as admin → navigate to Sellers tab → confirm list appears
3. Register a new seller — verify code "001" is auto-assigned, address fields appear
4. Click View → confirm detail page shows contact info and empty items table
5. Click + Add Item → verify no code field in form → add an item → confirm code "001-01" appears
6. Click Download Template → confirm `.xlsx` downloads
7. Log in as cashier → POS → type "atomic" in search → confirm description match appears
8. Log in as admin → Reports → Seller Payout → type "Jane" → pick from dropdown → click Get Payout → confirm summary + line items table
