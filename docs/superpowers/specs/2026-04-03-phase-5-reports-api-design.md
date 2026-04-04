# Phase 5 — Reports API Design

## Goal

Provide admin-accessible reporting endpoints for the MYSL Ski Swap POS: seller payouts, event revenue, donations, unsold items, end-of-day summary, and DB backup. All reports are exportable as JSON, CSV, Markdown, or PDF.

## Architecture

**Service layer separation:** Each report endpoint calls a report service function that queries the DB and returns a typed Pydantic model (pure data). A separate format renderer converts that model to the requested output format. Endpoints stay thin; data logic and presentation logic are independently testable.

**Event scoping:** All report endpoints take `event_id` as a path parameter so admins can query both the active event and historical events.

**Format selection:** `?format=json|csv|md|pdf` query parameter (default: `json`). Designed for a frontend dropdown.

## Tech Stack

- FastAPI, SQLAlchemy ORM, Pydantic v2
- `fpdf2` — pure Python PDF generation (no system deps)
- Python stdlib `csv`, `io`, `zipfile`, `shutil` for CSV, ZIP, and file copy

---

## 1. File Structure

| File | Responsibility |
|------|----------------|
| `app/routers/reports.py` | 6 report endpoints + backup endpoint |
| `app/services/reports.py` | DB queries; returns typed Pydantic report models |
| `app/services/report_formatter.py` | Converts report models → JSON/CSV/MD/PDF `Response` |
| `app/schemas/reports.py` | Pydantic models for each report type |

---

## 2. Endpoints

All endpoints require `admin` role.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/reports/{event_id}/seller/{seller_id}` | Seller payout report |
| `GET` | `/reports/{event_id}/revenue` | Event revenue summary |
| `GET` | `/reports/{event_id}/donations` | Donated proceeds + unsold donations |
| `GET` | `/reports/{event_id}/unsold` | Items still available |
| `GET` | `/reports/{event_id}/end-of-day` | Cash-out summary |
| `POST` | `/admin/backup` | Save SQLite + JSON to disk, return ZIP |

**Format query parameter:** `?format=json|csv|md|pdf` (default `json`)

**Response content types:**
- `json` → `application/json`
- `csv` → `text/csv` with `Content-Disposition: attachment; filename=<report>_<event_id>.csv`
- `md` → `text/markdown` with `Content-Disposition: attachment; filename=<report>_<event_id>.md`
- `pdf` → `application/pdf` with `Content-Disposition: attachment; filename=<report>_<event_id>.pdf`

---

## 3. Data Shapes (`app/schemas/reports.py`)

### SellerPayoutReport
```python
class SellerPayoutLineItem(BaseModel):
    item_code: str
    description: Optional[str]
    price: float           # original listed price
    sell_price: float      # actual sell price
    status: str            # sold / available / donated / returned

class SellerPayoutReport(BaseModel):
    event_id: int
    event_name: str
    seller_id: int
    seller_code: str
    seller_name: str
    seller_email: Optional[str]
    items_consigned: int
    items_sold: int
    items_unsold: int
    items_donated: int
    gross_sales: float     # sum of extended_price from non-voided sale_items
    mysl_total: float
    seller_total: float
    line_items: list[SellerPayoutLineItem]
    generated_at: datetime
```

### EventRevenueReport
```python
class EventRevenueReport(BaseModel):
    event_id: int
    event_name: str
    event_year: int
    total_sales: int           # count of non-voided sales
    voided_sales: int
    gross_revenue: float
    mysl_total: float
    seller_total: float
    cash_total: float
    check_total: float
    cc_total: float
    donate_proceeds_total: float  # mysl_total from donate_proceeds intakes
    generated_at: datetime
```

### DonationsReport
```python
class DonationItem(BaseModel):
    seller_code: str
    item_code: str
    description: Optional[str]
    price: float           # sell_price for donated-proceeds sold items; list price for donate_unsold items
    donation_type: str     # "proceeds" | "unsold"

class DonationsReport(BaseModel):
    event_id: int
    event_name: str
    items: list[DonationItem]
    total_items: int
    total_value: float
    generated_at: datetime
```

### UnsoldItemsReport
```python
class UnsoldItem(BaseModel):
    seller_code: str
    item_code: str
    description: Optional[str]
    category: Optional[str]
    price: float

class UnsoldItemsReport(BaseModel):
    event_id: int
    event_name: str
    items: list[UnsoldItem]
    total_items: int
    total_value: float
    generated_at: datetime
```

### EndOfDayReport
```python
class EndOfDayReport(BaseModel):
    event_id: int
    event_name: str
    date_generated: date       # date of report (today)
    sales_count: int
    voided_count: int
    gross_revenue: float
    mysl_total: float
    seller_total: float
    cash_total: float
    check_total: float
    cc_total: float
    generated_at: datetime     # exact timestamp
```

---

## 4. Report Service (`app/services/reports.py`)

One function per report. All functions take `db: Session` and `event_id: int`. Seller payout also takes `seller_id: int`.

**Key query rules:**
- Voided sales (`is_voided=True`) are excluded from all revenue/payout totals
- `SellerPayoutReport.gross_sales` is summed from `sale_item.extended_price` on non-voided sales
- `DonationsReport` includes two item types:
  - `"proceeds"`: sold items (non-voided) whose intake has `donate_proceeds=True`
  - `"unsold"`: items with `status="available"` and `donate_unsold=True` (item-level flag)
- `UnsoldItemsReport` includes all items with `status="available"` for the event
- `EndOfDayReport` is a condensed view of `EventRevenueReport` (same queries, fewer fields)

---

## 5. Format Renderer (`app/services/report_formatter.py`)

```python
def format_report(report: BaseModel, fmt: str, filename_base: str) -> Response:
    ...
```

| Format | Output | Notes |
|--------|--------|-------|
| `json` | `JSONResponse` | `report.model_dump(mode="json")` |
| `csv` | `StreamingResponse` | Flat rows; nested lists (e.g. `line_items`) expanded one row per entry; summary fields repeated on each row |
| `md` | `Response` with `text/markdown` | Markdown tables; summary block at top |
| `pdf` | `Response` with `application/pdf` | `fpdf2` — MYSL header, report title, generated timestamp, data table |

Invalid `fmt` value raises `HTTPException(422, "Invalid format: must be json, csv, md, or pdf")`.

---

## 6. DB Backup (`POST /admin/backup`)

Admin-only. No request body.

**Steps:**
1. Determine `event_year` from `max(Event.year)` across all events (falls back to current calendar year if no events exist)
2. Build timestamp string: `YYYYMMDD_HHMMSS`
3. Copy live SQLite file to `{BACKUP_DIR}/ski_swap_{event_year}_{timestamp}.db`
4. Query all tables via SQLAlchemy `inspect`; serialize rows to dicts; write to `{BACKUP_DIR}/ski_swap_{event_year}_{timestamp}.json`
5. Zip both files into `{BACKUP_DIR}/ski_swap_{event_year}_{timestamp}.zip`
6. Stream the ZIP back as `application/zip` with `Content-Disposition: attachment; filename=ski_swap_{event_year}_{timestamp}.zip`

`BACKUP_DIR` defaults to `backups/` relative to the project root; configurable via environment variable.

**Response:** ZIP file download (200). The `.db` and `.json` files remain on disk.

**Error:** 500 if backup directory is not writable, with detail message.

---

## 7. Error Handling

| Condition | Status | Detail |
|-----------|--------|--------|
| `event_id` not found | 404 | "Event not found" |
| `seller_id` not found | 404 | "Seller not found" |
| Seller not in specified event | 404 | "Seller not found in this event" |
| Invalid `?format=` value | 422 | "Invalid format: must be json, csv, md, or pdf" |
| Backup dir not writable | 500 | "Backup directory is not writable: {path}" |
| Non-admin role | 403 | (from `require_roles`) |

---

## 8. Role Matrix

| Endpoint | admin | cashier | intake |
|----------|-------|---------|--------|
| All `GET /reports/...` | ✅ | ❌ | ❌ |
| `POST /admin/backup` | ✅ | ❌ | ❌ |

---

## 9. Test Plan (`tests/test_reports.py`, ~30 tests)

### Seller Payout
- Sold items summed correctly into `gross_sales`, `mysl_total`, `seller_total`
- Voided sales excluded from totals
- `donate_proceeds=True` intake: `seller_total == 0`, `mysl_total == gross_sales`
- Seller with no sales: returns zeros, empty `line_items`
- Seller from wrong event: 404

### Event Revenue
- Cash/check/cc totals match payment fields on non-voided sales
- Voided sales excluded from revenue, counted in `voided_sales`
- `donate_proceeds_total` reflects only donate-proceeds intake sales

### Donations
- Sold items from `donate_proceeds` intake appear with `donation_type="proceeds"`
- Unsold items with `donate_unsold=True` appear with `donation_type="unsold"`
- Sold items from non-donate intake excluded
- `total_value` sums correctly

### Unsold Items
- Only `status="available"` items included
- Sold/donated/returned items excluded
- `total_value` sums list prices

### End of Day
- Totals match equivalent `EventRevenueReport` values
- `date_generated` is today's date

### Format Rendering
- Each report × each format (`json`, `csv`, `md`, `pdf`) returns correct `Content-Type` and non-empty body
- Invalid `?format=foo` returns 422

### Backup
- ZIP returned with 200 and `application/zip` content type
- `.db` and `.json` files written to backup directory

### Auth
- All endpoints return 403 for cashier and intake tokens

### Not Found
- Unknown `event_id` returns 404
- Unknown `seller_id` returns 404
