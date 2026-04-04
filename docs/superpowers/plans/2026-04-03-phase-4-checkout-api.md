# Phase 4 — Checkout API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement item lookup by code, atomic sale creation with commission splitting, sale retrieval, and admin void for the Checkout API.

**Architecture:** Three pre-flight fixes from Phase 3 review land first. Then: `compute_commission` in a new `checkout` service (pure, unit-tested); `GET /items/lookup` added to the existing items router (registered before `/{item_id}` to avoid FastAPI parsing "lookup" as an int); `POST /sales`, `GET /sales/{id}`, and `POST /sales/{id}/void` in a new `sales` router; `create_sale_atomic` in the checkout service wraps all DB mutations in a single transaction.

**Tech Stack:** FastAPI, SQLAlchemy ORM, Pydantic v2 (`ConfigDict(from_attributes=True)`), pytest with real in-memory SQLite (`StaticPool`). No new Alembic migration required.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/app/schemas/intake.py` | Modify | Add `IntakeWithItemsResponse` (moved from item.py) |
| `backend/app/schemas/item.py` | Modify | Remove `IntakeWithItemsResponse` and its `IntakeResponse` import |
| `backend/app/routers/intakes.py` | Modify | Update import to get `IntakeWithItemsResponse` from `schemas.intake` |
| `backend/app/routers/items.py` | Modify | Fix delete guard; add `_CASHIER_ADMIN`; add `GET /items/lookup` registered before `/{item_id}` |
| `backend/app/schemas/item.py` | Modify | Add `ItemLookupResponse` (extends `ItemResponse` with `seller_code`) |
| `backend/app/services/checkout.py` | Create | `compute_commission(item_price, donate_proceeds, commission_rate)` and `create_sale_atomic(db, payload, event, username)` |
| `backend/app/schemas/sale.py` | Create | `SaleItemCreate`, `SaleCreate`, `SaleItemResponse`, `SaleResponse`, `SaleWithItemsResponse` |
| `backend/app/routers/sales.py` | Create | `POST /sales`, `GET /sales/{id}`, `POST /sales/{id}/void` |
| `backend/app/main.py` | Modify | Include sales router |
| `backend/tests/test_checkout_service.py` | Create | 8 unit tests for `compute_commission` |
| `backend/tests/test_items.py` | Modify | Add 4 lookup endpoint tests |
| `backend/tests/test_sales.py` | Create | 18 integration tests for sales endpoints |

---

## Task 1: Pre-flight fixes from Phase 3 review

**Files:**
- Modify: `backend/app/schemas/intake.py`
- Modify: `backend/app/schemas/item.py`
- Modify: `backend/app/routers/intakes.py`
- Modify: `backend/app/routers/items.py`

### Fix 1A: Move `IntakeWithItemsResponse` from `schemas/item.py` to `schemas/intake.py`

`IntakeWithItemsResponse` semantically belongs in `intake.py`. Currently it lives in `item.py` (which imports `IntakeResponse` from `intake.py` just for this class). Moving it to `intake.py` removes that cross-import.

- [ ] **Step 1: Add `IntakeWithItemsResponse` to `schemas/intake.py`**

Append to the end of `backend/app/schemas/intake.py`:

```python
from app.schemas.item import ItemResponse


class IntakeWithItemsResponse(IntakeResponse):
    items: list[ItemResponse] = []
```

- [ ] **Step 2: Remove `IntakeWithItemsResponse` from `schemas/item.py`**

In `backend/app/schemas/item.py`, remove the following two things:

1. The import line at the top:
```python
from app.schemas.intake import IntakeResponse
```

2. The class at the bottom:
```python
class IntakeWithItemsResponse(IntakeResponse):
    items: list[ItemResponse] = []
```

- [ ] **Step 3: Update the import in `routers/intakes.py`**

In `backend/app/routers/intakes.py`, change line 14 from:
```python
from app.schemas.item import IntakeWithItemsResponse, ItemCreate, ItemResponse
```
to:
```python
from app.schemas.intake import IntakeCreate, IntakeResponse, IntakeUpdate, IntakeWithItemsResponse
from app.schemas.item import ItemCreate, ItemResponse
```

### Fix 1B: Tighten the delete guard in `routers/items.py`

Sold items must not be deletable. The current guard only checks `label_printed`.

- [ ] **Step 4: Update the delete guard in `backend/app/routers/items.py`**

Replace:
```python
    if item.label_printed:
        raise HTTPException(status_code=409, detail="Cannot delete item after label has been printed")
```
with:
```python
    if item.label_printed:
        raise HTTPException(status_code=409, detail="Cannot delete item after label has been printed")
    if item.status != "available":
        raise HTTPException(status_code=409, detail="Cannot delete a sold item")
```

- [ ] **Step 5: Run the full test suite to confirm nothing broke**

```bash
cd backend && python -m pytest -v
```

Expected: all existing tests pass (no new tests added in this task).

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/intake.py backend/app/schemas/item.py \
        backend/app/routers/intakes.py backend/app/routers/items.py
git commit -m "refactor: move IntakeWithItemsResponse to intake schema, tighten delete guard"
```

---

## Task 2: Commission service

**Files:**
- Create: `backend/app/services/checkout.py`
- Create: `backend/tests/test_checkout_service.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_checkout_service.py`:

```python
import pytest
from app.services.checkout import compute_commission


def test_standard_30_percent():
    mysl, seller = compute_commission(10.00, False, 0.30)
    assert mysl == 3.00
    assert seller == 7.00


def test_donate_proceeds_full_price_to_mysl():
    mysl, seller = compute_commission(10.00, True, 0.30)
    assert mysl == 10.00
    assert seller == 0.0


def test_donate_proceeds_ignores_commission_rate():
    mysl, seller = compute_commission(10.00, True, 0.0)
    assert mysl == 10.00
    assert seller == 0.0


def test_rounding_edge_case():
    # round(9.99 * 0.30, 2) = round(2.997, 2) = 3.0
    # seller = round(9.99 - 3.0, 2) = 6.99
    mysl, seller = compute_commission(9.99, False, 0.30)
    assert mysl == 3.00
    assert seller == 6.99


def test_zero_price():
    mysl, seller = compute_commission(0.0, False, 0.30)
    assert mysl == 0.0
    assert seller == 0.0


def test_25_percent_rate():
    mysl, seller = compute_commission(100.00, False, 0.25)
    assert mysl == 25.00
    assert seller == 75.00


def test_100_percent_rate():
    mysl, seller = compute_commission(50.00, False, 1.0)
    assert mysl == 50.00
    assert seller == 0.0


def test_sell_price_override_value_used():
    # Caller passes the resolved sell_price; this just confirms arithmetic
    mysl, seller = compute_commission(15.00, False, 0.30)
    assert mysl == 4.50
    assert seller == 10.50
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_checkout_service.py -v
```

Expected: `ImportError` — `checkout` module does not exist yet.

- [ ] **Step 3: Create `backend/app/services/checkout.py`**

```python
def compute_commission(
    item_price: float, donate_proceeds: bool, commission_rate: float
) -> tuple[float, float]:
    """Return (mysl_share, seller_share) rounded to 2 decimal places."""
    if donate_proceeds:
        return round(item_price, 2), 0.0
    mysl = round(item_price * commission_rate, 2)
    return mysl, round(item_price - mysl, 2)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && python -m pytest tests/test_checkout_service.py -v
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/checkout.py backend/tests/test_checkout_service.py
git commit -m "feat: checkout service — compute_commission with unit tests"
```

---

## Task 3: Item lookup endpoint

**Files:**
- Modify: `backend/app/schemas/item.py` (add `ItemLookupResponse`)
- Modify: `backend/app/routers/items.py` (add `_CASHIER_ADMIN`, add `GET /items/lookup`)
- Modify: `backend/tests/test_items.py` (add 4 lookup tests)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_items.py`:

```python
# ── Lookup tests ──────────────────────────────────────────────────────────────

def test_lookup_item_by_code(client, cashier_token, active_event, item, seller):
    resp = client.get(
        f"/items/lookup?code={item.code}",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == item.code
    assert data["seller_code"] == seller.code
    assert data["status"] == "available"


def test_lookup_item_not_found(client, cashier_token, active_event):
    resp = client.get(
        "/items/lookup?code=DOESNOTEXIST",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 404


def test_lookup_sold_item_returns_200_with_status(client, db, cashier_token, active_event, item):
    item.status = "sold"
    db.commit()
    resp = client.get(
        f"/items/lookup?code={item.code}",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "sold"


def test_lookup_intake_role_forbidden(client, intake_token, active_event, item):
    resp = client.get(
        f"/items/lookup?code={item.code}",
        headers={"Authorization": f"Bearer {intake_token}"},
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_items.py::test_lookup_item_by_code -v
```

Expected: 404 response (route not registered yet).

- [ ] **Step 3: Add `ItemLookupResponse` to `backend/app/schemas/item.py`**

Append to the end of `backend/app/schemas/item.py`:

```python
class ItemLookupResponse(ItemResponse):
    seller_code: str
```

- [ ] **Step 4: Add `_CASHIER_ADMIN` and `GET /items/lookup` to `backend/app/routers/items.py`**

Add `ItemLookupResponse` to the import line and add `_CASHIER_ADMIN` and `Seller` imports. The full updated imports section and new route — **`/lookup` must be added before `/{item_id}`** so FastAPI doesn't try to parse the string "lookup" as an integer:

At the top of `backend/app/routers/items.py`, add `Seller` to the model imports and `ItemLookupResponse` to the schema imports:

```python
from app.models.seller import Seller
```

```python
from app.schemas.item import ItemLookupResponse, ItemResponse, ItemUpdate
```

Add `_CASHIER_ADMIN` alongside the existing `_INTAKE_ADMIN`:

```python
_CASHIER_ADMIN = require_roles("admin", "cashier")
```

Add the lookup route **before** the `@router.get("/{item_id}", ...)` handler:

```python
@router.get("/lookup", response_model=ItemLookupResponse)
def lookup_item(
    code: str,
    db: Session = Depends(get_db),
    _user: User = Depends(_CASHIER_ADMIN),
):
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    item = (
        db.query(Item)
        .join(Intake)
        .join(Seller)
        .filter(Item.code == code, Seller.event_id == event.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item_data = {**ItemResponse.model_validate(item).model_dump(), "seller_code": item.seller.code}
    return ItemLookupResponse(**item_data)
```

- [ ] **Step 5: Run lookup tests to confirm they pass**

```bash
cd backend && python -m pytest tests/test_items.py -v
```

Expected: all tests pass (prior tests unaffected, 4 new lookup tests pass).

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/item.py backend/app/routers/items.py backend/tests/test_items.py
git commit -m "feat: GET /items/lookup endpoint with ItemLookupResponse including seller_code"
```

---

## Task 4: POST /sales — atomic sale creation

**Files:**
- Create: `backend/app/schemas/sale.py`
- Create: `backend/app/routers/sales.py`
- Modify: `backend/app/services/checkout.py` (add `create_sale_atomic`)
- Modify: `backend/app/main.py` (include sales router)
- Create: `backend/tests/test_sales.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_sales.py`:

```python
import datetime
import pytest
from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def seller(db, active_event):
    s = Seller(
        event_id=active_event.id,
        code="ABC",
        first_name="Jane",
        last_name="Smith",
        is_vendor=False,
        created_by="admin",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@pytest.fixture
def intake(db, seller):
    i = Intake(
        seller_id=seller.id,
        donate_proceeds=False,
        donate_unsold=False,
        created_by="admin",
    )
    db.add(i)
    db.commit()
    db.refresh(i)
    return i


@pytest.fixture
def donate_intake(db, seller):
    i = Intake(
        seller_id=seller.id,
        donate_proceeds=True,
        donate_unsold=False,
        created_by="admin",
    )
    db.add(i)
    db.commit()
    db.refresh(i)
    return i


@pytest.fixture
def item(db, intake, seller):
    it = Item(
        intake_id=intake.id,
        seller_id=seller.id,
        code="ABC-001",
        price=20.00,
        quantity=1.0,
        status="available",
        label_printed=True,
        created_by="admin",
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


@pytest.fixture
def item2(db, intake, seller):
    it = Item(
        intake_id=intake.id,
        seller_id=seller.id,
        code="ABC-002",
        price=15.00,
        quantity=1.0,
        status="available",
        label_printed=True,
        created_by="admin",
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


@pytest.fixture
def sold_item(db, intake, seller):
    it = Item(
        intake_id=intake.id,
        seller_id=seller.id,
        code="ABC-003",
        price=10.00,
        quantity=1.0,
        status="sold",
        label_printed=True,
        created_by="admin",
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


@pytest.fixture
def donate_item(db, donate_intake, seller):
    it = Item(
        intake_id=donate_intake.id,
        seller_id=seller.id,
        code="ABC-004",
        price=30.00,
        quantity=1.0,
        status="available",
        label_printed=True,
        created_by="admin",
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


# ── POST /sales tests ─────────────────────────────────────────────────────────

def test_create_sale_single_item(client, db, cashier_token, active_event, item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}], "cash_amount": 20.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["sale_total"] == 20.00
    assert data["mysl_total"] == 6.00      # 30% of 20
    assert data["seller_total"] == 14.00
    assert data["cash_amount"] == 20.00
    assert data["total_paid"] == 20.00
    assert data["balance_due"] == 0.00
    assert len(data["sale_items"]) == 1
    assert data["sale_items"][0]["sell_price"] == 20.00
    db.refresh(item)
    assert item.status == "sold"


def test_create_sale_multi_item(client, db, cashier_token, active_event, item, item2):
    resp = client.post(
        "/sales",
        json={
            "items": [{"item_id": item.id}, {"item_id": item2.id}],
            "cash_amount": 35.00,
        },
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["sale_total"] == 35.00      # 20 + 15
    assert data["mysl_total"] == 10.50      # (20*0.3) + (15*0.3) = 6 + 4.5
    assert data["seller_total"] == 24.50    # 14 + 10.5
    assert len(data["sale_items"]) == 2
    db.refresh(item)
    db.refresh(item2)
    assert item.status == "sold"
    assert item2.status == "sold"


def test_create_sale_sell_price_override(client, cashier_token, active_event, item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id, "sell_price": 15.00}], "cash_amount": 15.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["sale_total"] == 15.00
    assert data["mysl_total"] == 4.50       # 30% of 15
    assert data["seller_total"] == 10.50
    assert data["sale_items"][0]["sell_price"] == 15.00


def test_create_sale_donate_proceeds(client, cashier_token, active_event, donate_item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": donate_item.id}], "cash_amount": 30.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["sale_total"] == 30.00
    assert data["mysl_total"] == 30.00      # 100% to MYSL
    assert data["seller_total"] == 0.00


def test_create_sale_payment_split(client, cashier_token, active_event, item):
    resp = client.post(
        "/sales",
        json={
            "items": [{"item_id": item.id}],
            "cash_amount": 10.00,
            "check_amount": 5.00,
            "cc_amount": 5.00,
            "check_number": "1234",
        },
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["cash_amount"] == 10.00
    assert data["check_amount"] == 5.00
    assert data["cc_amount"] == 5.00
    assert data["check_number"] == "1234"
    assert data["total_paid"] == 20.00
    assert data["balance_due"] == 0.00


def test_create_sale_balance_due(client, cashier_token, active_event, item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}], "cash_amount": 10.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["sale_total"] == 20.00
    assert data["total_paid"] == 10.00
    assert data["balance_due"] == 10.00


def test_create_sale_item_not_available(client, cashier_token, active_event, sold_item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": sold_item.id}], "cash_amount": 10.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 422
    assert "ABC-003" in resp.json()["detail"]


def test_create_sale_item_not_found(client, cashier_token, active_event):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": 99999}], "cash_amount": 10.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 404


def test_create_sale_duplicate_item_id(client, cashier_token, active_event, item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}, {"item_id": item.id}], "cash_amount": 40.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 422


def test_create_sale_empty_items(client, cashier_token, active_event):
    resp = client.post(
        "/sales",
        json={"items": [], "cash_amount": 0.0},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 422


def test_create_sale_no_active_event(client, db, cashier_token):
    from app.models.event import Event
    db.query(Event).update({"is_active": False})
    db.commit()
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": 1}], "cash_amount": 0.0},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 503


def test_create_sale_intake_role_forbidden(client, intake_token, active_event, item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}], "cash_amount": 20.00},
        headers={"Authorization": f"Bearer {intake_token}"},
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_sales.py -v
```

Expected: `ImportError` or 404 — router not registered yet.

- [ ] **Step 3: Create `backend/app/schemas/sale.py`**

```python
import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class SaleItemCreate(BaseModel):
    item_id: int
    sell_price: Optional[float] = None
    notes: Optional[str] = None


class SaleCreate(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    notes: Optional[str] = None
    cash_amount: float = 0.0
    check_amount: float = 0.0
    check_number: Optional[str] = None
    cc_amount: float = 0.0
    items: list[SaleItemCreate]

    @field_validator("items")
    @classmethod
    def items_not_empty(cls, v: list) -> list:
        if not v:
            raise ValueError("items list must not be empty")
        return v


class SaleItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sale_id: int
    item_id: int
    line_number: Optional[int] = None
    quantity: float
    sell_price: float
    extended_price: float
    notes: Optional[str] = None
    created_at: datetime.datetime


class SaleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    date_of_sale: Optional[datetime.date] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    sale_total: float
    mysl_total: float
    seller_total: float
    cash_amount: float
    check_amount: float
    cc_amount: float
    check_number: Optional[str] = None
    total_paid: float
    balance_due: float
    notes: Optional[str] = None
    created_at: datetime.datetime
    created_by: Optional[str] = None


class SaleWithItemsResponse(SaleResponse):
    sale_items: list[SaleItemResponse] = []
```

- [ ] **Step 4: Replace `backend/app/services/checkout.py` with the full updated file**

(Keeps `compute_commission` unchanged, adds imports and `create_sale_atomic`.)

```python
from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.seller import Seller
from app.schemas.sale import SaleCreate


def compute_commission(
    item_price: float, donate_proceeds: bool, commission_rate: float
) -> tuple[float, float]:
    """Return (mysl_share, seller_share) rounded to 2 decimal places."""
    if donate_proceeds:
        return round(item_price, 2), 0.0
    mysl = round(item_price * commission_rate, 2)
    return mysl, round(item_price - mysl, 2)


def create_sale_atomic(
    db: Session, payload: SaleCreate, event: Event, username: str
) -> Sale:
    """Create a sale with all line items in a single transaction."""
    # Dedup check
    item_ids = [line.item_id for line in payload.items]
    if len(item_ids) != len(set(item_ids)):
        raise HTTPException(status_code=422, detail="Duplicate item_id in request")

    # Validate all items upfront before any mutations
    items_and_intakes: list[tuple] = []
    for line in payload.items:
        item = (
            db.query(Item)
            .join(Intake)
            .join(Seller)
            .filter(Item.id == line.item_id, Seller.event_id == event.id)
            .first()
        )
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {line.item_id} not found")
        if item.status != "available":
            raise HTTPException(
                status_code=422, detail=f"Item {item.code} is not available"
            )
        intake = db.query(Intake).filter(Intake.id == item.intake_id).first()
        items_and_intakes.append((line, item, intake))

    # Create sale row
    sale = Sale(
        event_id=event.id,
        date_of_sale=date.today(),
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        notes=payload.notes,
        cash_amount=payload.cash_amount,
        check_amount=payload.check_amount,
        check_number=payload.check_number,
        cc_amount=payload.cc_amount,
        created_by=username,
    )
    db.add(sale)
    db.flush()  # get sale.id without committing

    # Create sale_item rows, mark items sold, accumulate totals
    sale_total = 0.0
    mysl_total = 0.0
    seller_total = 0.0

    for line_number, (line, item, intake) in enumerate(items_and_intakes, start=1):
        sell_price = line.sell_price if line.sell_price is not None else item.price
        extended_price = round(sell_price * item.quantity, 2)
        mysl_share, seller_share = compute_commission(
            extended_price, intake.donate_proceeds, event.commission_rate
        )
        db.add(SaleItem(
            sale_id=sale.id,
            item_id=item.id,
            line_number=line_number,
            quantity=item.quantity,
            sell_price=sell_price,
            extended_price=extended_price,
            notes=line.notes,
            created_by=username,
        ))
        item.status = "sold"
        sale_total += extended_price
        mysl_total += mysl_share
        seller_total += seller_share

    sale.sale_total = round(sale_total, 2)
    sale.mysl_total = round(mysl_total, 2)
    sale.seller_total = round(seller_total, 2)
    sale.total_paid = round(
        payload.cash_amount + payload.check_amount + payload.cc_amount, 2
    )
    sale.balance_due = round(sale.sale_total - sale.total_paid, 2)

    db.commit()
    db.refresh(sale)
    return sale
```

- [ ] **Step 5: Create `backend/app/routers/sales.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models.event import Event
from app.models.sale import Sale
from app.models.user import User
from app.schemas.sale import SaleCreate, SaleResponse, SaleWithItemsResponse
from app.services.checkout import create_sale_atomic

router = APIRouter(prefix="/sales", tags=["sales"])

_CASHIER_ADMIN = require_roles("admin", "cashier")
_ADMIN_ONLY = require_roles("admin")


def _active_event(db: Session) -> Event:
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    return event


@router.post("", response_model=SaleWithItemsResponse, status_code=201)
def create_sale(
    body: SaleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_CASHIER_ADMIN),
):
    event = _active_event(db)
    return create_sale_atomic(db, body, event, current_user.username)


@router.get("/{sale_id}", response_model=SaleWithItemsResponse)
def get_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_CASHIER_ADMIN),
):
    event = _active_event(db)
    sale = db.query(Sale).filter(Sale.id == sale_id, Sale.event_id == event.id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale


@router.post("/{sale_id}/void", response_model=SaleResponse)
def void_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    event = _active_event(db)
    sale = db.query(Sale).filter(Sale.id == sale_id, Sale.event_id == event.id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    for sale_item in sale.sale_items:
        sale_item.item.status = "available"
    db.commit()
    db.refresh(sale)
    return sale
```

- [ ] **Step 6: Register the sales router in `backend/app/main.py`**

```python
from fastapi import FastAPI

from app.routers import auth, events, users, sellers, intakes, items
from app.routers.sales import router as sales_router

app = FastAPI(title="Ski Swap POS", version="1.0.0")

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(users.router)
app.include_router(sellers.router)
app.include_router(intakes.router)
app.include_router(items.router)
app.include_router(sales_router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 7: Run POST /sales tests to confirm they pass**

```bash
cd backend && python -m pytest tests/test_sales.py -k "create_sale" -v
```

Expected: all 12 POST /sales tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/sale.py backend/app/services/checkout.py \
        backend/app/routers/sales.py backend/app/main.py \
        backend/tests/test_sales.py
git commit -m "feat: POST /sales — atomic sale creation with commission splitting"
```

---

## Task 5: GET /sales/{id} and POST /sales/{id}/void

**Files:**
- Modify: `backend/tests/test_sales.py` (add 6 more tests)

The router handlers for GET and void were already written in Task 4. This task adds the tests and verifies them.

- [ ] **Step 1: Append GET and void tests to `backend/tests/test_sales.py`**

```python
# ── Shared fixture for GET and void tests ─────────────────────────────────────

@pytest.fixture
def created_sale(client, admin_token, active_event, item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}], "cash_amount": 20.00},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    return resp.json()


# ── GET /sales/{id} tests ─────────────────────────────────────────────────────

def test_get_sale(client, cashier_token, active_event, created_sale):
    resp = client.get(
        f"/sales/{created_sale['id']}",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == created_sale["id"]
    assert data["sale_total"] == 20.00
    assert len(data["sale_items"]) == 1


def test_get_sale_not_found(client, cashier_token, active_event):
    resp = client.get(
        "/sales/99999",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 404


def test_get_sale_intake_role_forbidden(client, intake_token, active_event, created_sale):
    resp = client.get(
        f"/sales/{created_sale['id']}",
        headers={"Authorization": f"Bearer {intake_token}"},
    )
    assert resp.status_code == 403


# ── POST /sales/{id}/void tests ───────────────────────────────────────────────

def test_void_sale_restores_item_status(client, db, admin_token, active_event, created_sale, item):
    resp = client.post(
        f"/sales/{created_sale['id']}/void",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    db.refresh(item)
    assert item.status == "available"


def test_void_sale_preserves_sale_record(client, db, admin_token, active_event, created_sale):
    from app.models.sale import Sale
    client.post(
        f"/sales/{created_sale['id']}/void",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert db.query(Sale).filter(Sale.id == created_sale["id"]).first() is not None


def test_void_sale_cashier_forbidden(client, cashier_token, active_event, created_sale):
    resp = client.post(
        f"/sales/{created_sale['id']}/void",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403


def test_void_sale_not_found(client, admin_token, active_event):
    resp = client.post(
        "/sales/99999/void",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404
```

- [ ] **Step 2: Run GET and void tests to confirm they pass**

```bash
cd backend && python -m pytest tests/test_sales.py -k "get_sale or void" -v
```

Expected: all 7 tests pass.

- [ ] **Step 3: Run the full test suite**

```bash
cd backend && python -m pytest -v
```

Expected: all tests pass. New total should be ~109 (79 prior + 8 commission unit + 4 lookup + 18 sales = 109).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_sales.py
git commit -m "test: GET /sales/{id} and POST /sales/{id}/void integration tests"
```

---

## Self-review checklist (agentic workers: do not skip)

After completing all tasks, verify:

- [ ] `pytest -v` passes with ~110 tests (79 prior + 8 commission unit + 4 lookup + 19 sales)
- [ ] `GET /items/lookup` route appears **before** `GET /items/{item_id}` in `routers/items.py`
- [ ] `IntakeWithItemsResponse` is imported from `app.schemas.intake` in `routers/intakes.py`
- [ ] `create_sale_atomic` uses a single `db.commit()` at the end (atomicity guarantee)
- [ ] `compute_commission` is called with `extended_price`, not `sell_price`, so quantity > 1 is handled correctly in future phases
