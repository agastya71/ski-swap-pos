"""Item and seller code generation.

Seller codes ("user ids") are derived from the seller's NAME — uppercase
letters plus a globally-unique numeric suffix, e.g. Jane Smith -> "JSMI1",
the next Jane/Joan/John Smith -> "JSMI2" (the suffix never resets or reuses,
and is unique across ALL events, so item codes derived from it are unique too).

Item codes are NUMERIC ONLY (2026-09-18 decision): five digits starting at
10000, assigned sequentially upward (10000, 10001, … 99999) and unique within
the event database — each event gets its own database with the same schema,
so the counter is per-event by construction. Codes are auto-assigned at
intake time (and by bulk import); seller codes remain alphanumeric. Items
created before this change keep their legacy alphanumeric codes (no
renumbering — printed labels stay valid); generation only bumps past codes
that actually exist, so both schemes coexist.
"""

from sqlalchemy.orm import Session

from app.models.item import Item
from app.models.seller import Seller

_AZ = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
_FALLBACK_PREFIX = "GEN"

# Numeric item ids: five digits, 10000..99999, sequential, unique per event DB.
_NUMERIC_ITEM_START = 10000
_NUMERIC_ITEM_END = 99999

__all__ = ["next_seller_code", "next_item_code", "seller_code_prefix"]


def _letters(value: str | None) -> str:
    """Uppercase A-Z letters of a name fragment, in order (accents stripped)."""
    return "".join(ch for ch in (value or "").upper() if ch in _AZ)


def seller_code_prefix(
    first_name: str | None, last_name: str | None, company: str | None, is_vendor: bool
) -> str:
    """Name-derived code prefix, up to 4 uppercase letters.

    Individuals: first initial + first 3 letters of the last name
    ("Jane Smith" -> "JSMI"). Vendors (or nameless individuals): first 4
    letters of the company, else of the personal name. Falls back to "GEN"
    when no A-Z letters exist anywhere.
    """
    if is_vendor:
        source = _letters(company) or (_letters(last_name) + _letters(first_name))
        prefix = source[:4]
    elif last_name:
        prefix = (_letters(first_name)[:1] + _letters(last_name)[:3])[:4]
    else:
        prefix = _letters(first_name)[:4]
    return prefix or _FALLBACK_PREFIX


def next_seller_code(
    db: Session,
    first_name: str | None,
    last_name: str | None,
    company: str | None,
    is_vendor: bool,
) -> str:
    """Globally-unique seller code for the given name.

    The numeric suffix starts at 1 (no leading zeros) and skips suffixes whose
    full code is already taken by any seller in ANY event, so codes never
    collide across swap years.
    """
    prefix = seller_code_prefix(first_name, last_name, company, is_vendor)
    n = 1
    while db.query(Seller.id).filter(Seller.code == f"{prefix}{n}").first() is not None:
        n += 1
    return f"{prefix}{n}"


def _numeric_value(code: str) -> int | None:
    """int() of a digit string, or None for anything non-numeric."""
    try:
        return int(code)
    except ValueError:
        return None


def next_item_code(db: Session, reserved: set[str] | None = None) -> str:
    """Next numeric-only item code: five digits starting at 10000, going up.

    Unique within the event database (this single-DB query IS the per-event
    scope; Phase G gives each event its own database file). Only committed
    rows are visible — batch importers must pass every code generated so far
    in the same uncommitted batch via ``reserved``. The DB unique constraint
    on item.code remains the final backstop.

    Raises ValueError when the five-digit space is exhausted (after 99999).
    """
    codes = [str(c) for (c,) in db.query(Item.code).all() if c is not None]
    numeric = [v for c in codes if (v := _numeric_value(c)) is not None]
    n = max(numeric + [_NUMERIC_ITEM_START - 1]) + 1
    taken = set(codes) | (reserved or set())
    while n <= _NUMERIC_ITEM_END and str(n) in taken:
        n += 1
    if n > _NUMERIC_ITEM_END:
        raise ValueError(
            f"Numeric item ids exhausted: all codes {_NUMERIC_ITEM_START}-{_NUMERIC_ITEM_END} are taken"
        )
    return str(n)