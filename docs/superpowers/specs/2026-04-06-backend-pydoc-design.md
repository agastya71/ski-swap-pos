# Backend Inline Documentation (Pydoc) Design

**Date:** 2026-04-06
**Status:** Approved

---

## Problem

The backend Python codebase (~30 meaningful files) has almost no inline documentation. Developers reading the code must trace through implementations to understand what each module, class, or function does, what arguments are expected, and what errors may be raised.

## Goal

Add Google-style docstrings to all meaningful backend Python files so developers can understand each module and function without reading the implementation body.

## Scope

**In scope — 30 files across 4 layers:**

| Layer | Files |
|---|---|
| `app/services/` | auth.py, checkout.py, reports.py, report_formatter.py, zpl.py |
| `app/routers/` | auth.py, users.py, events.py, sellers.py, intakes.py, items.py, sales.py, reports.py, admin.py |
| `app/models/` | user.py, event.py, seller.py, intake.py, item.py, sale.py, sale_item.py |
| `app/schemas/` | auth.py, user.py, event.py, seller.py, intake.py, item.py, sale.py, reports.py |

**Out of scope:** Empty `__init__.py` files, Alembic migration files (already have revision docstrings), `config.py` (constants only), `database.py`, `main.py`, `migrations/env.py`.

## Docstring Style: Google

All docstrings follow [Google Python Style Guide](https://google.github.io/styleguide/pyguide.html#38-comments-and-docstrings) conventions:

```python
def example(db: Session, event_id: int) -> Event:
    """Fetch an event by ID or raise 404.

    Args:
        db: Active SQLAlchemy database session.
        event_id: Primary key of the event to retrieve.

    Returns:
        The matching Event ORM instance.

    Raises:
        HTTPException: 404 if no event with the given ID exists.
    """
```

## Documentation Rules by Layer

### Services (`app/services/`)

- **Module docstring:** One paragraph describing the module's responsibility.
- **Function docstrings:** Full Google style — summary line, Args, Returns, Raises where applicable.
- **Private helpers** (`_` prefix): Short summary line only; Args/Returns omitted unless non-obvious.
- **Existing docstrings** in checkout.py, zpl.py, report_formatter.py: Reviewed and brought into Google style conformance rather than replaced wholesale.

### Routers (`app/routers/`)

- **Module docstring:** One sentence naming the resource this router manages and the role required.
- **Endpoint function docstrings:** Single summary line only. FastAPI renders these directly in the `/docs` OpenAPI UI as endpoint descriptions — they must be concise and user-facing.
- **Private helpers** (`_` prefix): Short summary line only.

Example:
```python
@router.post("/{event_id}/end-of-day")
def get_end_of_day(event_id: int, ...):
    """Return the end-of-day summary report for an event."""
```

### Models (`app/models/`)

- **Module docstring:** One sentence describing which database table and domain concept the file represents.
- **Class docstring:** One paragraph describing the table's purpose and its key relationships.
- **Column-level comments:** Not required — column names are self-documenting; add inline `#` comments only where the business rule behind a column is non-obvious (e.g., `donate_proceeds`, `commission_rate`).

### Schemas (`app/schemas/`)

- **Module docstring:** One sentence naming the domain object and what the schemas cover (create/update/response).
- **Class docstrings:** One sentence describing the schema's role (e.g., "Payload for creating a new sale transaction.").
- **Field documentation:** Use `Field(description="...")` on every field. Descriptions explain the field's business meaning, not just its type. Fields that already have `ge=`, `le=`, or other validators keep their existing validators; `description=` is added alongside them.

Example:
```python
class SaleCreate(BaseModel):
    """Payload for creating a new sale transaction."""

    event_id: int = Field(description="ID of the active event this sale belongs to.")
    cash_amount: float = Field(ge=0, description="Amount tendered in cash.")
    items: list[SaleItemCreate] = Field(description="Line items included in this sale.")
```

## Execution

Four subagents run in parallel, one per layer, each responsible for all files in their layer. All changes land on a single feature branch and are submitted as one PR.

## No Functional Changes

Docstrings are additive only. No logic, imports, signatures, validators, or field definitions change — except adding `description=` to existing `Field(...)` calls or wrapping bare field assignments in `Field(description=...)`.

## Testing

No new tests required. The existing test suite (87 tests) must continue to pass after all changes.
