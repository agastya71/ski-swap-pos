# Phase 4 — Checkout API Design

**Date:** 2026-04-03
**Phase:** 4 of 6
**Depends on:** Phase 3 (Intake API) — all seller/intake/item data in place

---

## 1. Overview

Phase 4 delivers the sale-day checkout backend: item lookup by code, atomic sale creation with commission splitting, sale retrieval, and admin void. All endpoints are scoped to the active event.

---

## 2. Architecture

**Option chosen:** Lookup in items router + dedicated sales router + checkout service.

| Layer | File | Responsibility |
|-------|------|----------------|
| Service | `backend/app/services/checkout.py` | Commission calc, atomic sale creation |
| Schemas | `backend/app/schemas/sale.py` | Request/response models for sales |
| Router | `backend/app/routers/sales.py` | `POST /sales`, `GET /sales/{id}`, `POST /sales/{id}/void` |
| Router (existing) | `backend/app/routers/items.py` | Add `GET /items/lookup?code=` |

No new Alembic migration required — all `sale` and `sale_item` columns exist in the current schema.

---

## 3. File Map

**New files:**

| File | Purpose |
|------|---------|
| `backend/app/services/checkout.py` | `compute_commission()`, `create_sale_atomic()` |
| `backend/app/schemas/sale.py` | `SaleItemCreate`, `SaleCreate`, `SaleItemResponse`, `SaleResponse`, `SaleWithItemsResponse` |
| `backend/app/routers/sales.py` | Sales endpoints |
| `backend/tests/test_checkout_service.py` | Unit tests for commission logic (~8 tests) |
| `backend/tests/test_sales.py` | Integration tests for sales endpoints (~18 tests) |

**Modified files:**

| File | Change |
|------|--------|
| `backend/app/routers/items.py` | Add `GET /items/lookup?code=` |
| `backend/app/main.py` | Include sales router |
| `backend/tests/test_items.py` | Add lookup endpoint tests (~4 tests) |

---

## 4. Endpoints

### `GET /items/lookup?code=<str>`
- **Roles:** cashier, admin
- **Returns:** `ItemLookupResponse` — extends `ItemResponse` with `seller_code: str`
- **Errors:** 503 (no active event), 404 (item not found or not in active event)
- **Note:** Returns item regardless of status (cashier sees "already sold" inline from the status field)

### `POST /sales`
- **Roles:** cashier, admin
- **Request body:**
  ```json
  {
    "customer_name": "string (optional)",
    "customer_email": "string (optional)",
    "notes": "string (optional)",
    "cash_amount": 0.0,
    "check_amount": 0.0,
    "check_number": "string (optional)",
    "cc_amount": 0.0,
    "items": [
      { "item_id": 1, "sell_price": null, "notes": "string (optional)" }
    ]
  }
  ```
- `sell_price`: optional — defaults to `item.price` if omitted or null
- `items` must be non-empty (422 otherwise)
- **Returns:** `SaleWithItemsResponse`
- **Errors:** 503, 404 (item not found), 422 (item not available, empty items list)

### `GET /sales/{id}`
- **Roles:** cashier, admin
- **Returns:** `SaleWithItemsResponse`
- **Errors:** 503, 404

### `POST /sales/{id}/void`
- **Roles:** admin only
- **No request body**
- Restores all sale items to `status = available`
- **Returns:** `SaleResponse`
- **Errors:** 503, 404, 403 (non-admin)

---

## 5. Schemas

```python
# SaleItemCreate (request line item)
item_id: int
sell_price: Optional[float] = None   # defaults to item.price if null
notes: Optional[str] = None

# SaleCreate (request body)
customer_name: Optional[str] = None
customer_email: Optional[str] = None
notes: Optional[str] = None
cash_amount: float = 0.0
check_amount: float = 0.0
check_number: Optional[str] = None
cc_amount: float = 0.0
items: list[SaleItemCreate]   # min length 1

# SaleItemResponse
id, sale_id, item_id, line_number, quantity, sell_price, extended_price, notes, created_at

# SaleResponse
id, event_id, date_of_sale, customer_name, customer_email,
sale_total, mysl_total, seller_total,
cash_amount, check_amount, cc_amount, check_number,
total_paid, balance_due, notes, created_at, created_by

# SaleWithItemsResponse
...SaleResponse fields + sale_items: list[SaleItemResponse]

# ItemLookupResponse (extends ItemResponse)
seller_code: str
```

---

## 6. Business Logic

### Commission Calculation (`checkout.py`)

Applied per item at time of sale. `item_price` = `sell_price` from request, or `item.price` if not overridden.

```python
def compute_commission(item_price, intake, event):
    if intake.donate_proceeds:
        return item_price, 0.0        # (mysl_share, seller_share)
    mysl = round(item_price * event.commission_rate, 2)
    return mysl, round(item_price - mysl, 2)
```

Sale-level `mysl_total` and `seller_total` are sums of per-item shares across all line items.

### Atomic Sale Creation

Single SQLite transaction — any failure rolls back everything:

1. Verify active event exists (503 if not)
2. Verify no duplicate `item_id` values in the request (422 if duplicates found)
3. For each `item_id` in request:
   - Load item, verify it belongs to active event (404 if not)
   - Verify `item.status == "available"` (422 with item code in detail if not)
4. Create `Sale` row (event_id, date_of_sale=today, payment fields, created_by=current user)
5. For each item:
   - Resolve `sell_price` (request value or `item.price`)
   - Compute `extended_price = sell_price * quantity` (quantity always 1.0 for now)
   - Create `SaleItem` row with `line_number` = position in list
   - Set `item.status = "sold"`
6. Compute and set `sale.sale_total`, `sale.mysl_total`, `sale.seller_total`
7. Set `sale.total_paid = cash_amount + check_amount + cc_amount`
8. Set `sale.balance_due = sale_total - total_paid`
9. `db.commit()`

### Void

Single transaction:

1. Load sale, verify belongs to active event
2. For each `sale_item`: set `item.status = "available"`
3. `db.commit()`

Note: void does not delete the sale or sale_item rows — the record is preserved for audit.

---

## 7. Error Handling

| Condition | Status | Detail |
|-----------|--------|--------|
| No active event | 503 | "No active event configured" |
| Item not found / wrong event | 404 | "Item not found" |
| Item status != available | 422 | "Item {code} is not available" |
| Sale not found / wrong event | 404 | "Sale not found" |
| Empty items list | 422 | Pydantic validation (min_length=1 on items field) |
| Duplicate item_id in request | 422 | "Duplicate item_id in request" |
| Cashier attempts void | 403 | FastAPI role dependency |
| Intake role on any sale endpoint | 403 | FastAPI role dependency |

---

## 8. Role Matrix

| Endpoint | admin | cashier | intake |
|----------|-------|---------|--------|
| `GET /items/lookup` | ✅ | ✅ | ❌ |
| `POST /sales` | ✅ | ✅ | ❌ |
| `GET /sales/{id}` | ✅ | ✅ | ❌ |
| `POST /sales/{id}/void` | ✅ | ❌ | ❌ |

---

## 9. Testing Plan

### `test_checkout_service.py` (~8 unit tests, no DB)
- Standard commission: rate applied correctly, values rounded to 2 decimal places
- donate_proceeds path: mysl_share = full price, seller_share = 0
- sell_price override: commission uses override, not item.price
- Multi-item totals: sale_total, mysl_total, seller_total sum correctly
- Rounding edge cases (e.g. 0.30 × $9.99)

### `test_items.py` additions (~4 tests)
- Lookup by code with cashier token → 200 + ItemLookupResponse with seller_code
- Lookup unknown code → 404
- Lookup sold item → 200 (status field shows "sold")
- Intake role → 403

### `test_sales.py` (~18 integration tests)
- Single-item sale: item transitions to sold, sale totals computed correctly
- Multi-item sale: items from different sellers, totals across all items
- sell_price override: extended_price and totals use override value
- donate_proceeds intake: mysl_total = sale_total, seller_total = 0
- Duplicate item_id in request: 422 (caught by upfront dedup check)
- Item already sold: 422 with item code in detail
- Item from wrong event: 404
- Empty items list: 422
- No active event: 503
- GET /sales/{id}: returns sale with line items
- GET /sales/{id} wrong event: 404
- Void by admin: items restored to available, sale record preserved
- Void by cashier: 403
- Void unknown sale: 404
- Intake role on POST /sales: 403
- Intake role on GET /sales/{id}: 403
- payment fields (cash/check/cc) stored and returned correctly
- balance_due = sale_total - total_paid
