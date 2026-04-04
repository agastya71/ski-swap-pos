# Phase 5 — Reports API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-only reporting endpoints (seller payout, event revenue, donations, unsold items, end-of-day) plus a DB backup endpoint, all supporting JSON/CSV/Markdown/PDF output.

**Architecture:** Report service functions query the DB and return typed Pydantic models; a format renderer converts those models to the requested format; thin router endpoints wire them together. The `?format=` query parameter drives format selection. Backup saves both SQLite copy and JSON dump to disk, then streams a ZIP download.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 ORM, Pydantic v2, `fpdf2` (pure Python PDF), stdlib `csv`/`zipfile`/`shutil`

---

## Pre-flight: existing codebase context

- `backend/app/config.py` — add `BACKUP_DIR` env var here
- `backend/app/database.py` — exports `engine` (needed for backup inspection)
- `backend/app/dependencies.py` — `require_roles(*roles)` factory for auth
- `backend/app/models/` — `Event`, `Seller`, `Intake`, `Item`, `Sale`, `SaleItem`
- `backend/tests/conftest.py` — provides `db`, `client`, `active_event`, `admin_token`, `cashier_token`, `intake_token` fixtures
- Test runner: `cd backend && pytest`
- Commit from repo root: `cd /Users/u0102180/code/personal-projects/ski-swap-pos && git add backend/... && git commit`

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `backend/app/schemas/reports.py` | Pydantic models for all report types |
| Modify | `backend/app/config.py` | Add `BACKUP_DIR` |
| Modify | `backend/requirements.txt` | Add `fpdf2==2.7.9` |
| Create | `backend/app/services/reports.py` | DB query functions → typed report models |
| Create | `backend/app/services/report_formatter.py` | Convert report models → JSON/CSV/MD/PDF Response |
| Create | `backend/app/routers/reports.py` | 5 report endpoints |
| Create | `backend/app/routers/admin.py` | `POST /admin/backup` |
| Modify | `backend/app/main.py` | Register both new routers |
| Create | `backend/tests/test_report_service.py` | Unit tests for service functions |
| Create | `backend/tests/test_report_formatter.py` | Unit tests for format renderer |
| Create | `backend/tests/test_reports.py` | Integration tests for report endpoints |
| Create | `backend/tests/test_admin.py` | Integration tests for backup endpoint |

---

## Task 1: Schemas, config, and fpdf2

**Files:**
- Create: `backend/app/schemas/reports.py`
- Modify: `backend/app/config.py`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add fpdf2 to requirements.txt**

Open `backend/requirements.txt` and add:
```
fpdf2==2.7.9
```

- [ ] **Step 2: Install fpdf2**

```bash
cd backend && pip install fpdf2==2.7.9
```

Expected: `Successfully installed fpdf2-2.7.9`

- [ ] **Step 3: Add BACKUP_DIR to config**

In `backend/app/config.py`, add one line at the end:
```python
BACKUP_DIR: str = os.getenv("BACKUP_DIR", "backups")
```

Full file after edit:
```python
import os

DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./swap.db")
JWT_SECRET: str = os.getenv("JWT_SECRET", "change-me-before-event-day")
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRE_MINUTES: int = 480  # 8-hour shift
LABEL_PRINTER_PATH: str = os.getenv("LABEL_PRINTER_PATH", "/dev/usb/lp0")
BACKUP_DIR: str = os.getenv("BACKUP_DIR", "backups")
```

- [ ] **Step 4: Create backend/app/schemas/reports.py**

```python
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class SellerPayoutLineItem(BaseModel):
    item_code: str
    description: Optional[str] = None
    price: float
    sell_price: float
    status: str


class SellerPayoutReport(BaseModel):
    event_id: int
    event_name: str
    seller_id: int
    seller_code: str
    seller_name: str
    seller_email: Optional[str] = None
    items_consigned: int
    items_sold: int
    items_unsold: int
    items_donated: int
    gross_sales: float
    mysl_total: float
    seller_total: float
    line_items: list[SellerPayoutLineItem]
    generated_at: datetime


class EventRevenueReport(BaseModel):
    event_id: int
    event_name: str
    event_year: int
    total_sales: int
    voided_sales: int
    gross_revenue: float
    mysl_total: float
    seller_total: float
    cash_total: float
    check_total: float
    cc_total: float
    donate_proceeds_total: float
    generated_at: datetime


class DonationItem(BaseModel):
    seller_code: str
    item_code: str
    description: Optional[str] = None
    price: float
    donation_type: str  # "proceeds" | "unsold"


class DonationsReport(BaseModel):
    event_id: int
    event_name: str
    items: list[DonationItem]
    total_items: int
    total_value: float
    generated_at: datetime


class UnsoldItem(BaseModel):
    seller_code: str
    item_code: str
    description: Optional[str] = None
    category: Optional[str] = None
    price: float


class UnsoldItemsReport(BaseModel):
    event_id: int
    event_name: str
    items: list[UnsoldItem]
    total_items: int
    total_value: float
    generated_at: datetime


class EndOfDayReport(BaseModel):
    event_id: int
    event_name: str
    date_generated: date
    sales_count: int
    voided_count: int
    gross_revenue: float
    mysl_total: float
    seller_total: float
    cash_total: float
    check_total: float
    cc_total: float
    generated_at: datetime
```

- [ ] **Step 5: Verify no import errors**

```bash
cd backend && python -c "from app.schemas.reports import SellerPayoutReport, EndOfDayReport; print('OK')"
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
cd /Users/u0102180/code/personal-projects/ski-swap-pos
git add backend/app/schemas/reports.py backend/app/config.py backend/requirements.txt
git commit -m "feat: Phase 5 schemas, BACKUP_DIR config, fpdf2 dependency"
```

---

## Task 2: Report service

**Files:**
- Create: `backend/app/services/reports.py`
- Create: `backend/tests/test_report_service.py`

- [ ] **Step 1: Write failing tests in backend/tests/test_report_service.py**

```python
import pytest
from app.models.intake import Intake
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.seller import Seller


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def seller(db, active_event):
    s = Seller(event_id=active_event.id, code="TST", first_name="Test", last_name="Seller",
               is_vendor=False, created_by="admin")
    db.add(s); db.commit(); db.refresh(s)
    return s


@pytest.fixture
def intake(db, seller):
    i = Intake(seller_id=seller.id, donate_proceeds=False, donate_unsold=False, created_by="admin")
    db.add(i); db.commit(); db.refresh(i)
    return i


@pytest.fixture
def donate_intake(db, seller):
    i = Intake(seller_id=seller.id, donate_proceeds=True, donate_unsold=False, created_by="admin")
    db.add(i); db.commit(); db.refresh(i)
    return i


@pytest.fixture
def available_item(db, intake, seller):
    it = Item(intake_id=intake.id, seller_id=seller.id, code="TST-001", price=20.00,
              quantity=1.0, status="available", label_printed=True, created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    return it


@pytest.fixture
def sold_item(db, intake, seller):
    it = Item(intake_id=intake.id, seller_id=seller.id, code="TST-002", price=15.00,
              quantity=1.0, status="sold", label_printed=True, created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    return it


@pytest.fixture
def donate_sold_item(db, donate_intake, seller):
    it = Item(intake_id=donate_intake.id, seller_id=seller.id, code="TST-003", price=30.00,
              quantity=1.0, status="sold", label_printed=True, created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    return it


@pytest.fixture
def sale(db, active_event, sold_item):
    s = Sale(event_id=active_event.id, sale_total=15.00, mysl_total=4.50,
             seller_total=10.50, cash_amount=15.00, check_amount=0.0, cc_amount=0.0,
             total_paid=15.00, balance_due=0.0, is_voided=False, created_by="admin")
    db.add(s); db.flush()
    db.add(SaleItem(sale_id=s.id, item_id=sold_item.id, line_number=1,
                    quantity=1.0, sell_price=15.00, extended_price=15.00, created_by="admin"))
    db.commit(); db.refresh(s)
    return s


@pytest.fixture
def voided_sale(db, active_event, available_item):
    s = Sale(event_id=active_event.id, sale_total=20.00, mysl_total=6.00,
             seller_total=14.00, cash_amount=20.00, check_amount=0.0, cc_amount=0.0,
             total_paid=20.00, balance_due=0.0, is_voided=True, created_by="admin")
    db.add(s); db.flush()
    db.add(SaleItem(sale_id=s.id, item_id=available_item.id, line_number=1,
                    quantity=1.0, sell_price=20.00, extended_price=20.00, created_by="admin"))
    db.commit(); db.refresh(s)
    return s


@pytest.fixture
def donate_sale(db, active_event, donate_sold_item):
    s = Sale(event_id=active_event.id, sale_total=30.00, mysl_total=30.00,
             seller_total=0.0, cash_amount=30.00, check_amount=0.0, cc_amount=0.0,
             total_paid=30.00, balance_due=0.0, is_voided=False, created_by="admin")
    db.add(s); db.flush()
    db.add(SaleItem(sale_id=s.id, item_id=donate_sold_item.id, line_number=1,
                    quantity=1.0, sell_price=30.00, extended_price=30.00, created_by="admin"))
    db.commit(); db.refresh(s)
    return s


# ── Seller payout ─────────────────────────────────────────────────────────────

def test_seller_payout_sums_sold_items(db, active_event, seller, sale, sold_item):
    from app.services.reports import get_seller_payout
    report = get_seller_payout(db, active_event.id, seller.id)
    assert report.gross_sales == 15.00
    assert report.mysl_total == 4.50
    assert report.seller_total == 10.50
    assert report.items_sold == 1
    assert report.seller_code == "TST"


def test_seller_payout_excludes_voided(db, active_event, seller, voided_sale, available_item):
    from app.services.reports import get_seller_payout
    report = get_seller_payout(db, active_event.id, seller.id)
    assert report.gross_sales == 0.0
    assert report.mysl_total == 0.0
    assert report.seller_total == 0.0


def test_seller_payout_donate_proceeds_zeroes_seller(db, active_event, seller, donate_sale, donate_sold_item):
    from app.services.reports import get_seller_payout
    report = get_seller_payout(db, active_event.id, seller.id)
    assert report.seller_total == 0.0
    assert report.mysl_total == report.gross_sales


def test_seller_payout_no_sales_returns_zeros(db, active_event, seller, available_item):
    from app.services.reports import get_seller_payout
    report = get_seller_payout(db, active_event.id, seller.id)
    assert report.gross_sales == 0.0
    assert report.items_consigned == 1


def test_seller_payout_wrong_event_raises_404(db, seller):
    from fastapi import HTTPException
    from app.services.reports import get_seller_payout
    with pytest.raises(HTTPException) as exc:
        get_seller_payout(db, 99999, seller.id)
    assert exc.value.status_code == 404


def test_seller_payout_wrong_seller_raises_404(db, active_event):
    from fastapi import HTTPException
    from app.services.reports import get_seller_payout
    with pytest.raises(HTTPException) as exc:
        get_seller_payout(db, active_event.id, 99999)
    assert exc.value.status_code == 404


# ── Event revenue ─────────────────────────────────────────────────────────────

def test_event_revenue_totals(db, active_event, sale, sold_item, seller, intake):
    from app.services.reports import get_event_revenue
    report = get_event_revenue(db, active_event.id)
    assert report.gross_revenue == 15.00
    assert report.total_sales == 1
    assert report.voided_sales == 0
    assert report.cash_total == 15.00


def test_event_revenue_excludes_voided(db, active_event, voided_sale, available_item, seller, intake):
    from app.services.reports import get_event_revenue
    report = get_event_revenue(db, active_event.id)
    assert report.gross_revenue == 0.0
    assert report.voided_sales == 1
    assert report.total_sales == 0


def test_event_revenue_donate_proceeds_total(db, active_event, donate_sale, donate_sold_item, seller, donate_intake):
    from app.services.reports import get_event_revenue
    report = get_event_revenue(db, active_event.id)
    assert report.donate_proceeds_total == 30.00


# ── Donations ─────────────────────────────────────────────────────────────────

def test_donations_proceeds_type(db, active_event, donate_sale, donate_sold_item, seller, donate_intake):
    from app.services.reports import get_donations
    report = get_donations(db, active_event.id)
    assert len(report.items) == 1
    assert report.items[0].donation_type == "proceeds"
    assert report.items[0].price == 30.00


def test_donations_unsold_type(db, active_event, seller):
    from app.models.intake import Intake
    from app.models.item import Item
    from app.services.reports import get_donations
    i = Intake(seller_id=seller.id, donate_proceeds=False, donate_unsold=True, created_by="admin")
    db.add(i); db.commit(); db.refresh(i)
    it = Item(intake_id=i.id, seller_id=seller.id, code="DU-001", price=10.00,
              quantity=1.0, status="available", label_printed=True,
              donate_unsold=True, created_by="admin")
    db.add(it); db.commit()
    report = get_donations(db, active_event.id)
    unsold = [x for x in report.items if x.donation_type == "unsold"]
    assert len(unsold) == 1
    assert unsold[0].item_code == "DU-001"


# ── Unsold items ──────────────────────────────────────────────────────────────

def test_unsold_only_available(db, active_event, seller, intake, available_item, sold_item):
    from app.services.reports import get_unsold_items
    report = get_unsold_items(db, active_event.id)
    codes = [i.item_code for i in report.items]
    assert "TST-001" in codes
    assert "TST-002" not in codes


# ── End of day ────────────────────────────────────────────────────────────────

def test_end_of_day_matches_revenue(db, active_event, sale, sold_item, seller, intake):
    from app.services.reports import get_end_of_day, get_event_revenue
    rev = get_event_revenue(db, active_event.id)
    eod = get_end_of_day(db, active_event.id)
    assert eod.gross_revenue == rev.gross_revenue
    assert eod.sales_count == rev.total_sales
    assert eod.voided_count == rev.voided_sales
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_report_service.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError` or `ImportError` on `app.services.reports`

- [ ] **Step 3: Create backend/app/services/reports.py**

```python
from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.seller import Seller
from app.schemas.reports import (
    DonationItem,
    DonationsReport,
    EndOfDayReport,
    EventRevenueReport,
    SellerPayoutLineItem,
    SellerPayoutReport,
    UnsoldItem,
    UnsoldItemsReport,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get_event_or_404(db: Session, event_id: int) -> Event:
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


def get_seller_payout(db: Session, event_id: int, seller_id: int) -> SellerPayoutReport:
    event = _get_event_or_404(db, event_id)
    seller = db.query(Seller).filter(
        Seller.id == seller_id, Seller.event_id == event_id
    ).first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found in this event")

    items = db.query(Item).filter(Item.seller_id == seller_id).all()
    items_sold = sum(1 for it in items if it.status == "sold")
    items_unsold = sum(1 for it in items if it.status == "available")
    items_donated = sum(1 for it in items if it.status == "donated")

    sale_items = (
        db.query(SaleItem)
        .join(Sale)
        .join(Item, SaleItem.item_id == Item.id)
        .filter(Item.seller_id == seller_id, Sale.is_voided == False)
        .all()
    )

    gross_sales = round(sum(si.extended_price for si in sale_items), 2)
    mysl_total = 0.0
    seller_total_amt = 0.0
    for si in sale_items:
        if si.item.intake.donate_proceeds:
            mysl_total += si.extended_price
        else:
            mysl_share = round(si.extended_price * event.commission_rate, 2)
            mysl_total += mysl_share
            seller_total_amt += si.extended_price - mysl_share

    si_by_item = {si.item_id: si for si in sale_items}
    line_items = [
        SellerPayoutLineItem(
            item_code=it.code,
            description=it.description,
            price=it.price,
            sell_price=si_by_item[it.id].sell_price if it.id in si_by_item else it.price,
            status=it.status,
        )
        for it in items
    ]

    return SellerPayoutReport(
        event_id=event_id,
        event_name=event.name,
        seller_id=seller_id,
        seller_code=seller.code,
        seller_name=f"{seller.first_name} {seller.last_name}",
        seller_email=seller.email,
        items_consigned=len(items),
        items_sold=items_sold,
        items_unsold=items_unsold,
        items_donated=items_donated,
        gross_sales=gross_sales,
        mysl_total=round(mysl_total, 2),
        seller_total=round(seller_total_amt, 2),
        line_items=line_items,
        generated_at=_now(),
    )


def get_event_revenue(db: Session, event_id: int) -> EventRevenueReport:
    event = _get_event_or_404(db, event_id)
    all_sales = db.query(Sale).filter(Sale.event_id == event_id).all()
    non_voided = [s for s in all_sales if not s.is_voided]
    voided = [s for s in all_sales if s.is_voided]

    donate_proceeds_total = 0.0
    for s in non_voided:
        for si in s.sale_items:
            if si.item.intake.donate_proceeds:
                donate_proceeds_total += si.extended_price

    return EventRevenueReport(
        event_id=event_id,
        event_name=event.name,
        event_year=event.year,
        total_sales=len(non_voided),
        voided_sales=len(voided),
        gross_revenue=round(sum(s.sale_total for s in non_voided), 2),
        mysl_total=round(sum(s.mysl_total for s in non_voided), 2),
        seller_total=round(sum(s.seller_total for s in non_voided), 2),
        cash_total=round(sum(s.cash_amount for s in non_voided), 2),
        check_total=round(sum(s.check_amount for s in non_voided), 2),
        cc_total=round(sum(s.cc_amount for s in non_voided), 2),
        donate_proceeds_total=round(donate_proceeds_total, 2),
        generated_at=_now(),
    )


def get_donations(db: Session, event_id: int) -> DonationsReport:
    event = _get_event_or_404(db, event_id)

    proceeds_sale_items = (
        db.query(SaleItem)
        .join(Sale)
        .join(Item, SaleItem.item_id == Item.id)
        .join(Intake, Item.intake_id == Intake.id)
        .join(Seller, Item.seller_id == Seller.id)
        .filter(
            Sale.event_id == event_id,
            Sale.is_voided == False,
            Intake.donate_proceeds == True,
        )
        .all()
    )
    unsold_donate = (
        db.query(Item)
        .join(Seller)
        .filter(
            Seller.event_id == event_id,
            Item.status == "available",
            Item.donate_unsold == True,
        )
        .all()
    )

    items = [
        DonationItem(
            seller_code=si.item.seller.code,
            item_code=si.item.code,
            description=si.item.description,
            price=si.sell_price,
            donation_type="proceeds",
        )
        for si in proceeds_sale_items
    ] + [
        DonationItem(
            seller_code=it.seller.code,
            item_code=it.code,
            description=it.description,
            price=it.price,
            donation_type="unsold",
        )
        for it in unsold_donate
    ]

    return DonationsReport(
        event_id=event_id,
        event_name=event.name,
        items=items,
        total_items=len(items),
        total_value=round(sum(i.price for i in items), 2),
        generated_at=_now(),
    )


def get_unsold_items(db: Session, event_id: int) -> UnsoldItemsReport:
    event = _get_event_or_404(db, event_id)
    items = (
        db.query(Item)
        .join(Seller)
        .filter(Seller.event_id == event_id, Item.status == "available")
        .all()
    )
    unsold = [
        UnsoldItem(
            seller_code=it.seller.code,
            item_code=it.code,
            description=it.description,
            category=it.category,
            price=it.price,
        )
        for it in items
    ]
    return UnsoldItemsReport(
        event_id=event_id,
        event_name=event.name,
        items=unsold,
        total_items=len(unsold),
        total_value=round(sum(i.price for i in unsold), 2),
        generated_at=_now(),
    )


def get_end_of_day(db: Session, event_id: int) -> EndOfDayReport:
    rev = get_event_revenue(db, event_id)
    return EndOfDayReport(
        event_id=rev.event_id,
        event_name=rev.event_name,
        date_generated=date.today(),
        sales_count=rev.total_sales,
        voided_count=rev.voided_sales,
        gross_revenue=rev.gross_revenue,
        mysl_total=rev.mysl_total,
        seller_total=rev.seller_total,
        cash_total=rev.cash_total,
        check_total=rev.check_total,
        cc_total=rev.cc_total,
        generated_at=rev.generated_at,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_report_service.py -v
```

Expected: 12 tests passing

- [ ] **Step 5: Commit**

```bash
cd /Users/u0102180/code/personal-projects/ski-swap-pos
git add backend/app/services/reports.py backend/tests/test_report_service.py
git commit -m "feat: report service — seller payout, revenue, donations, unsold, end-of-day"
```

---

## Task 3: Format renderer

**Files:**
- Create: `backend/app/services/report_formatter.py`
- Create: `backend/tests/test_report_formatter.py`

- [ ] **Step 1: Write failing tests in backend/tests/test_report_formatter.py**

```python
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
                                 price=20.00, sell_price=20.00, status="sold"),
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
```

- [ ] **Step 2: Verify tests fail**

```bash
cd backend && pytest tests/test_report_formatter.py -v 2>&1 | head -10
```

Expected: `ModuleNotFoundError` on `app.services.report_formatter`

- [ ] **Step 3: Create backend/app/services/report_formatter.py**

```python
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
        headers={"Content-Disposition": f"attachment; filename={filename_base}.csv"},
    )


def _to_md(report: BaseModel, filename_base: str) -> Response:
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
        headers={"Content-Disposition": f"attachment; filename={filename_base}.md"},
    )


def _to_pdf(report: BaseModel, filename_base: str) -> Response:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "MYSL Ski Swap POS")
    pdf.ln()
    pdf.set_font("Helvetica", "", 12)

    if isinstance(report, SellerPayoutReport):
        pdf.cell(0, 8, f"Seller Payout: {report.seller_name} ({report.seller_code})")
        pdf.ln()
        pdf.cell(0, 6, f"Event: {report.event_name}")
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
        for hdr, w in [("Item Code", 30), ("Description", 65), ("Price", 25),
                       ("Sell Price", 25), ("Status", 25)]:
            pdf.cell(w, 6, hdr, border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 9)
        for li in report.line_items:
            pdf.cell(30, 6, li.item_code, border=1)
            pdf.cell(65, 6, (li.description or "")[:35], border=1)
            pdf.cell(25, 6, f"${li.price:.2f}", border=1)
            pdf.cell(25, 6, f"${li.sell_price:.2f}", border=1)
            pdf.cell(25, 6, li.status, border=1)
            pdf.ln()

    elif isinstance(report, EventRevenueReport):
        pdf.cell(0, 8, f"Event Revenue: {report.event_name}")
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
        pdf.cell(0, 8, f"Donations: {report.event_name}")
        pdf.ln()
        pdf.cell(0, 6, f"Total Items: {report.total_items}  Total Value: ${report.total_value:.2f}")
        pdf.ln(6)
        pdf.set_font("Helvetica", "B", 10)
        for hdr, w in [("Seller", 25), ("Item Code", 30), ("Description", 65),
                       ("Price", 25), ("Type", 25)]:
            pdf.cell(w, 6, hdr, border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 9)
        for item in report.items:
            pdf.cell(25, 6, item.seller_code, border=1)
            pdf.cell(30, 6, item.item_code, border=1)
            pdf.cell(65, 6, (item.description or "")[:35], border=1)
            pdf.cell(25, 6, f"${item.price:.2f}", border=1)
            pdf.cell(25, 6, item.donation_type, border=1)
            pdf.ln()

    elif isinstance(report, UnsoldItemsReport):
        pdf.cell(0, 8, f"Unsold Items: {report.event_name}")
        pdf.ln()
        pdf.cell(0, 6, f"Total Items: {report.total_items}  Total Value: ${report.total_value:.2f}")
        pdf.ln(6)
        pdf.set_font("Helvetica", "B", 10)
        for hdr, w in [("Seller", 25), ("Item Code", 30), ("Description", 65),
                       ("Category", 30), ("Price", 20)]:
            pdf.cell(w, 6, hdr, border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 9)
        for item in report.items:
            pdf.cell(25, 6, item.seller_code, border=1)
            pdf.cell(30, 6, item.item_code, border=1)
            pdf.cell(65, 6, (item.description or "")[:35], border=1)
            pdf.cell(30, 6, item.category or "", border=1)
            pdf.cell(20, 6, f"${item.price:.2f}", border=1)
            pdf.ln()

    elif isinstance(report, EndOfDayReport):
        pdf.cell(0, 8, f"End of Day: {report.event_name}")
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
        headers={"Content-Disposition": f"attachment; filename={filename_base}.pdf"},
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_report_formatter.py -v
```

Expected: 6 tests passing

- [ ] **Step 5: Commit**

```bash
cd /Users/u0102180/code/personal-projects/ski-swap-pos
git add backend/app/services/report_formatter.py backend/tests/test_report_formatter.py
git commit -m "feat: report formatter — JSON/CSV/Markdown/PDF rendering"
```

---

## Task 4: Reports router + integration tests

**Files:**
- Create: `backend/app/routers/reports.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_reports.py`

- [ ] **Step 1: Write failing tests in backend/tests/test_reports.py**

```python
import pytest
from app.models.intake import Intake
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.seller import Seller


@pytest.fixture
def rpt_seller(db, active_event):
    s = Seller(event_id=active_event.id, code="RPT", first_name="Report", last_name="Seller",
               is_vendor=False, created_by="admin")
    db.add(s); db.commit(); db.refresh(s)
    return s


@pytest.fixture
def rpt_intake(db, rpt_seller):
    i = Intake(seller_id=rpt_seller.id, donate_proceeds=False, donate_unsold=False,
               created_by="admin")
    db.add(i); db.commit(); db.refresh(i)
    return i


@pytest.fixture
def rpt_item(db, rpt_intake, rpt_seller):
    it = Item(intake_id=rpt_intake.id, seller_id=rpt_seller.id, code="RPT-001",
              price=25.00, quantity=1.0, status="sold", label_printed=True,
              created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    return it


@pytest.fixture
def rpt_sale(db, active_event, rpt_item):
    s = Sale(event_id=active_event.id, sale_total=25.00, mysl_total=7.50,
             seller_total=17.50, cash_amount=25.00, check_amount=0.0, cc_amount=0.0,
             total_paid=25.00, balance_due=0.0, is_voided=False, created_by="admin")
    db.add(s); db.flush()
    db.add(SaleItem(sale_id=s.id, item_id=rpt_item.id, line_number=1,
                    quantity=1.0, sell_price=25.00, extended_price=25.00, created_by="admin"))
    db.commit(); db.refresh(s)
    return s


# ── Seller payout ─────────────────────────────────────────────────────────────

def test_seller_payout_json(client, admin_token, active_event, rpt_sale, rpt_seller):
    resp = client.get(
        f"/reports/{active_event.id}/seller/{rpt_seller.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["seller_code"] == "RPT"
    assert data["gross_sales"] == 25.00


def test_seller_payout_csv(client, admin_token, active_event, rpt_sale, rpt_seller):
    resp = client.get(
        f"/reports/{active_event.id}/seller/{rpt_seller.id}?format=csv",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]


def test_seller_payout_md(client, admin_token, active_event, rpt_sale, rpt_seller):
    resp = client.get(
        f"/reports/{active_event.id}/seller/{rpt_seller.id}?format=md",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert "markdown" in resp.headers["content-type"]


def test_seller_payout_pdf(client, admin_token, active_event, rpt_sale, rpt_seller):
    resp = client.get(
        f"/reports/{active_event.id}/seller/{rpt_seller.id}?format=pdf",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"


def test_seller_payout_wrong_event(client, admin_token):
    resp = client.get(
        "/reports/99999/seller/1",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


def test_seller_payout_wrong_seller(client, admin_token, active_event):
    resp = client.get(
        f"/reports/{active_event.id}/seller/99999",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


# ── Revenue ───────────────────────────────────────────────────────────────────

def test_revenue_json(client, admin_token, active_event, rpt_sale):
    resp = client.get(
        f"/reports/{active_event.id}/revenue",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["gross_revenue"] == 25.00
    assert data["total_sales"] == 1


def test_revenue_wrong_event(client, admin_token):
    resp = client.get(
        "/reports/99999/revenue",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


# ── Donations ─────────────────────────────────────────────────────────────────

def test_donations_json(client, admin_token, active_event, rpt_sale):
    resp = client.get(
        f"/reports/{active_event.id}/donations",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert "items" in resp.json()


# ── Unsold ────────────────────────────────────────────────────────────────────

def test_unsold_json_excludes_sold(client, admin_token, active_event, rpt_item):
    # rpt_item.status == "sold", so unsold count should be 0
    resp = client.get(
        f"/reports/{active_event.id}/unsold",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["total_items"] == 0


# ── End of day ────────────────────────────────────────────────────────────────

def test_end_of_day_json(client, admin_token, active_event, rpt_sale):
    resp = client.get(
        f"/reports/{active_event.id}/end-of-day",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["gross_revenue"] == 25.00
    assert data["sales_count"] == 1


# ── Format validation ─────────────────────────────────────────────────────────

def test_invalid_format_returns_422(client, admin_token, active_event):
    resp = client.get(
        f"/reports/{active_event.id}/revenue?format=xml",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422


# ── Auth ──────────────────────────────────────────────────────────────────────

def test_cashier_forbidden(client, cashier_token, active_event):
    resp = client.get(
        f"/reports/{active_event.id}/revenue",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403


def test_intake_forbidden(client, intake_token, active_event):
    resp = client.get(
        f"/reports/{active_event.id}/revenue",
        headers={"Authorization": f"Bearer {intake_token}"},
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Verify tests fail**

```bash
cd backend && pytest tests/test_reports.py -v 2>&1 | head -15
```

Expected: 404 errors (routes not registered yet)

- [ ] **Step 3: Create backend/app/routers/reports.py**

```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models.user import User
from app.services import reports as report_svc
from app.services.report_formatter import format_report

router = APIRouter(prefix="/reports", tags=["reports"])

_ADMIN_ONLY = require_roles("admin")


@router.get("/{event_id}/seller/{seller_id}")
def get_seller_payout(
    event_id: int,
    seller_id: int,
    format: str = Query("json"),
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    report = report_svc.get_seller_payout(db, event_id, seller_id)
    return format_report(report, format, f"seller_payout_{event_id}_{seller_id}")


@router.get("/{event_id}/revenue")
def get_revenue(
    event_id: int,
    format: str = Query("json"),
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    report = report_svc.get_event_revenue(db, event_id)
    return format_report(report, format, f"revenue_{event_id}")


@router.get("/{event_id}/donations")
def get_donations(
    event_id: int,
    format: str = Query("json"),
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    report = report_svc.get_donations(db, event_id)
    return format_report(report, format, f"donations_{event_id}")


@router.get("/{event_id}/unsold")
def get_unsold(
    event_id: int,
    format: str = Query("json"),
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    report = report_svc.get_unsold_items(db, event_id)
    return format_report(report, format, f"unsold_{event_id}")


@router.get("/{event_id}/end-of-day")
def get_end_of_day(
    event_id: int,
    format: str = Query("json"),
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    report = report_svc.get_end_of_day(db, event_id)
    return format_report(report, format, f"end_of_day_{event_id}")
```

- [ ] **Step 4: Register the router in backend/app/main.py**

```python
from fastapi import FastAPI

from app.routers import auth, events, users, sellers, intakes, items
from app.routers.sales import router as sales_router
from app.routers.reports import router as reports_router

app = FastAPI(title="Ski Swap POS", version="1.0.0")

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(users.router)
app.include_router(sellers.router)
app.include_router(intakes.router)
app.include_router(items.router)
app.include_router(sales_router)
app.include_router(reports_router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_reports.py -v
```

Expected: 15 tests passing

- [ ] **Step 6: Run full suite to check for regressions**

```bash
cd backend && pytest --tb=short -q
```

Expected: all tests passing

- [ ] **Step 7: Commit**

```bash
cd /Users/u0102180/code/personal-projects/ski-swap-pos
git add backend/app/routers/reports.py backend/app/main.py backend/tests/test_reports.py
git commit -m "feat: reports router — seller payout, revenue, donations, unsold, end-of-day"
```

---

## Task 5: Backup endpoint

**Files:**
- Create: `backend/app/routers/admin.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_admin.py`

- [ ] **Step 1: Write failing tests in backend/tests/test_admin.py**

```python
import io
import zipfile

import pytest


def test_backup_returns_zip(client, admin_token, active_event, tmp_path, monkeypatch):
    import app.config as config
    monkeypatch.setattr(config, "BACKUP_DIR", str(tmp_path))
    resp = client.post(
        "/admin/backup",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(resp.content))
    assert any(n.endswith(".json") for n in z.namelist())


def test_backup_writes_json_to_disk(client, admin_token, active_event, tmp_path, monkeypatch):
    import app.config as config
    monkeypatch.setattr(config, "BACKUP_DIR", str(tmp_path))
    client.post(
        "/admin/backup",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert len(list(tmp_path.glob("*.json"))) == 1


def test_backup_cashier_forbidden(client, cashier_token, active_event):
    resp = client.post(
        "/admin/backup",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403


def test_backup_intake_forbidden(client, intake_token, active_event):
    resp = client.post(
        "/admin/backup",
        headers={"Authorization": f"Bearer {intake_token}"},
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Verify tests fail**

```bash
cd backend && pytest tests/test_admin.py -v 2>&1 | head -15
```

Expected: 404 (route not registered) or import error

- [ ] **Step 3: Create backend/app/routers/admin.py**

```python
import io
import json
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import func, inspect as sa_inspect, text
from sqlalchemy.orm import Session

from app.config import BACKUP_DIR, DATABASE_URL
from app.database import engine, get_db
from app.dependencies import require_roles
from app.models.event import Event
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin"])

_ADMIN_ONLY = require_roles("admin")


def _json_default(obj):
    from datetime import date
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    return str(obj)


@router.post("/backup")
def backup_database(
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    backup_dir = Path(BACKUP_DIR)
    try:
        backup_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        raise HTTPException(
            status_code=500,
            detail=f"Backup directory is not writable: {backup_dir}",
        )

    max_year = db.query(func.max(Event.year)).scalar() or datetime.now().year
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    base_name = f"ski_swap_{max_year}_{timestamp}"

    # JSON export of all tables
    json_path = backup_dir / f"{base_name}.json"
    inspector = sa_inspect(engine)
    all_data: dict = {}
    with engine.connect() as conn:
        for table_name in inspector.get_table_names():
            result = conn.execute(text(f"SELECT * FROM {table_name}"))
            all_data[table_name] = [dict(row._mapping) for row in result.fetchall()]
    json_path.write_text(json.dumps(all_data, default=_json_default, indent=2))

    # Build ZIP (SQLite file copy skipped for :memory: databases)
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        db_file = DATABASE_URL.replace("sqlite:///", "")
        if ":memory:" not in db_file:
            db_copy_path = backup_dir / f"{base_name}.db"
            shutil.copy2(db_file, db_copy_path)
            zf.write(db_copy_path, f"{base_name}.db")
        zf.write(json_path, f"{base_name}.json")

    zip_bytes = zip_buffer.getvalue()
    (backup_dir / f"{base_name}.zip").write_bytes(zip_bytes)

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={base_name}.zip"},
    )
```

- [ ] **Step 4: Register admin router in backend/app/main.py**

```python
from fastapi import FastAPI

from app.routers import auth, events, users, sellers, intakes, items
from app.routers.sales import router as sales_router
from app.routers.reports import router as reports_router
from app.routers.admin import router as admin_router

app = FastAPI(title="Ski Swap POS", version="1.0.0")

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(users.router)
app.include_router(sellers.router)
app.include_router(intakes.router)
app.include_router(items.router)
app.include_router(sales_router)
app.include_router(reports_router)
app.include_router(admin_router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_admin.py -v
```

Expected: 4 tests passing

- [ ] **Step 6: Run full suite**

```bash
cd backend && pytest --tb=short -q
```

Expected: all tests passing (should be ~150 total)

- [ ] **Step 7: Commit**

```bash
cd /Users/u0102180/code/personal-projects/ski-swap-pos
git add backend/app/routers/admin.py backend/app/main.py backend/tests/test_admin.py
git commit -m "feat: POST /admin/backup — SQLite + JSON export, ZIP download"
```
