# Vendor Commission Rate — Design Specification

**Date:** 2026-04-11
**Status:** Approved

---

## Overview

The event currently has a single `commission_rate` applied to all sellers. This change adds a second event-level rate — `vendor_commission_rate` — applied to sellers flagged as vendors (`is_vendor=True`). The existing `commission_rate` becomes the explicit "individual seller" rate.

---

## 1. Backend

### Model — `backend/app/models/event.py`

Add one column alongside the existing `commission_rate`:

```python
vendor_commission_rate = Column(Float, nullable=False, default=0.30)
```

Default 0.30 (30%) matches the individual seller default. Existing events are unaffected on migration.

### Schemas — `backend/app/schemas/event.py`

Add `vendor_commission_rate` to all three schema classes:

**`EventCreate`:**
```python
vendor_commission_rate: float = Field(default=0.30, ge=0.0, le=1.0)
```

**`EventUpdate`:**
```python
vendor_commission_rate: float = Field(default=0.30, ge=0.0, le=1.0)
```

**`EventResponse`:**
```python
vendor_commission_rate: float
```

### Migration — `backend/migrations/versions/<hash>_add_vendor_commission_rate.py`

```python
def upgrade() -> None:
    with op.batch_alter_table('event', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('vendor_commission_rate', sa.Float(), nullable=False,
                      server_default='0.30')
        )

def downgrade() -> None:
    with op.batch_alter_table('event', schema=None) as batch_op:
        batch_op.drop_column('vendor_commission_rate')
```

### Payout service — `backend/app/services/reports.py`

In `get_seller_payout()`, the seller object is already available (used for name/code/email). Change the rate lookup from:

```python
mysl_share = round(si.extended_price * event.commission_rate, 2)
```

to:

```python
rate = event.vendor_commission_rate if seller.is_vendor else event.commission_rate
mysl_share = round(si.extended_price * rate, 2)
```

All downstream math is unchanged. The `SellerPayoutReport` schema does not change — the rate itself is not returned, only the computed totals.

### Tests — `backend/tests/test_reports.py`

Add two test cases:
1. A non-vendor seller uses `commission_rate`.
2. A vendor seller (`is_vendor=True`) uses `vendor_commission_rate`.

Both tests create items, record a sale, and assert that `mysl_total` and `seller_total` reflect the correct rate.

---

## 2. Frontend

### Types — `frontend/src/types.ts`

Add `vendor_commission_rate: number` to the `Event` interface.

### Event Setup — `frontend/src/admin/EventSetup.tsx`

Add a second state variable and form field mirroring the existing commission rate field:

**State:** `const [vendorCommission, setVendorCommission] = useState('0.30')`

**Create call:** include `vendor_commission_rate: parseFloat(vendorCommission)` in the `createEvent` payload.

**Event table:** add a "Vendor Rate" column showing `(ev.vendor_commission_rate * 100).toFixed(0)%`.

**Create form:** add a field immediately below the existing Commission Rate field:

```
Commission Rate (decimal, e.g. 0.30):        [input: eventCommission]
Vendor Commission Rate (decimal, e.g. 0.25): [input: eventVendorCommission]
```

Both fields use `type="number" step="0.01" min="0" max="1"` and store values as decimals (matching the backend).

### Tests — `frontend/src/admin/EventSetup.test.tsx`

Add one test: mock an event with `vendor_commission_rate: 0.25`, render EventSetup, and assert the value appears in the events table as "25%".

---

## Affected Files

| File | Change |
|------|--------|
| `backend/app/models/event.py` | Add `vendor_commission_rate` column |
| `backend/app/schemas/event.py` | Add field to EventCreate, EventUpdate, EventResponse |
| `backend/migrations/versions/<hash>_add_vendor_commission_rate.py` | New migration |
| `backend/app/services/reports.py` | Rate branch on `seller.is_vendor` |
| `backend/tests/test_reports.py` | Two new payout rate tests |
| `frontend/src/types.ts` | Add `vendor_commission_rate` to Event type |
| `frontend/src/admin/EventSetup.tsx` | Second rate state + field + table column |
| `frontend/src/admin/EventSetup.test.tsx` | One new test |

---

## Out of Scope

- Per-seller commission rate overrides (beyond vendor/non-vendor distinction)
- Showing the applied rate on the payout report
- Retroactively re-computing historical payouts when rates change
