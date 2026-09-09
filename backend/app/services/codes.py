"""Item and seller code generation.

Seller codes ("user ids") are derived from the seller's NAME — uppercase
letters plus a globally-unique numeric suffix, e.g. Jane Smith -> "JSMI1",
the next Jane/Joan/John Smith -> "JSMI2" (the suffix never resets or reuses,
and is unique across ALL events, so item codes derived from it are unique too).

Item codes combine the seller code and a sequence number with NO hyphen and
NO leading zeros: Jane Smith's items are "JSMI11", "JSMI12", ... — at most
10 characters (seller prefix <= 5 + up to 5-digit sequence).

Names with no A-Z letters at all fall back to the prefix "GEN".
"""

from sqlalchemy.orm import Session

from app.models.item import Item
from app.models.seller import Seller

_AZ = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
_FALLBACK_PREFIX = "GEN"

__all__ = ["next_seller_code", "next_item_code", "next_item_seq", "seller_code_prefix"]


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


def next_item_seq(db: Session, seller: Seller) -> int:
    """First unused item-code sequence number for the seller's code prefix."""
    prefix = f"{seller.code}"
    seq = 1
    while db.query(Item.id).filter(Item.code == f"{prefix}{seq}").first() is not None:
        seq += 1
    return seq


def next_item_code(db: Session, seller: Seller) -> str:
    """Globally-unique item code for a seller: seller code + sequence number.

    The sequence starts at 1 with no leading zeros, and bumps past any code
    already taken (including by other sellers whose codes extend this one as
    a prefix, e.g. seller "JSMI1" vs "JSMI11"). Sees committed rows only; a
    DB unique constraint on item.code remains the final backstop.
    """
    prefix = f"{seller.code}"
    seq = next_item_seq(db, seller)
    return f"{prefix}{seq}"