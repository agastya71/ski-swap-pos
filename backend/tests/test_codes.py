"""Tests for item/seller code generation (app/services/codes.py).

Covers the name-derived seller code scheme ("Jane Smith" -> "JSMI1") and the
globally-unique numeric-suffix behaviour, including the Jane/Joan/John Smith
cluster, vendor company names, accented names, and cross-event uniqueness.
Also covers numeric-only item-id generation (2026-09-18): five digits starting
at 10000, sequential upward, unique per event DB, legacy alphanumeric codes
grandfathered (ignored by generation).
"""

from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller
from app.services.codes import next_item_code, next_seller_code, seller_code_prefix


# ── seller_code_prefix ────────────────────────────────────────────────────────

def test_prefix_individual_initial_plus_last_name():
    assert seller_code_prefix("Jane", "Smith", None, False) == "JSMI"


def test_prefix_vendor_uses_company():
    assert seller_code_prefix("Nordic", "Ski Shop", "Nordic Ski Shop LLC", True) == "NORD"


def test_prefix_strips_accents_and_non_letters():
    assert seller_code_prefix("José", "González", None, False) == "JGON"


def test_prefix_falls_back_when_no_letters():
    assert seller_code_prefix(None, None, None, False) == "GEN"


def test_prefix_uses_company_for_vendor_without_company_letters_in_last_name():
    assert seller_code_prefix(None, None, "Summit Outfitters Inc", True) == "SUMM"


# ── next_seller_code ──────────────────────────────────────────────────────────

def test_same_prefix_cluster_gets_distinct_suffixes(db, active_event):
    """Jane / Joan / John Smith all derive the prefix JSMI; the suffix
    disambiguates them (JSMI1, JSMI2, JSMI3) with no leading zeros."""
    codes = []
    for first in ("Jane", "Joan", "John"):
        code = next_seller_code(db, first, "Smith", None, False)
        db.add(Seller(event_id=active_event.id, code=code, first_name=first, last_name="Smith"))
        db.commit()
        codes.append(code)
    assert codes == ["JSMI1", "JSMI2", "JSMI3"]


def test_seller_code_suffix_is_global_across_events(db, active_event):
    """The suffix counter never resets — the same name in a different event
    gets the next suffix, so codes never collide across swap years."""
    db.add(Seller(event_id=active_event.id, code="JSMI1", first_name="Jane", last_name="Smith"))
    db.commit()
    other = Event(name="Swap 2027", year=2027, commission_rate=0.30, is_active=False)
    db.add(other)
    db.commit()
    assert next_seller_code(db, "Jane", "Smith", None, False) == "JSMI2"


def test_seller_code_vendor_company_name(db, active_event):
    assert next_seller_code(db, "Nordic", "Ski Shop", "Nordic Ski Shop LLC", True) == "NORD1"


# ── next_item_code ────────────────────────────────────────────────────────────

def _add_item(db: Session, seller: Seller, code: str) -> None:
    """Insert an item row with an explicit (possibly legacy) code."""
    intake = Intake(seller_id=seller.id)
    db.add(intake)
    db.flush()
    db.add(Item(intake_id=intake.id, seller_id=seller.id, code=code, price=10.0))
    db.commit()


def test_item_code_starts_at_10000_on_empty_event(db, active_event):
    assert next_item_code(db) == "10000"


def test_item_code_is_five_digits_numeric_only(db, active_event):
    code = next_item_code(db)
    assert len(code) == 5 and code.isdigit()


def test_item_code_continues_after_existing_numeric_codes(db, active_event):
    """Items 10000..10104 already present -> next is 10105 (sequential up)."""
    seller = Seller(event_id=active_event.id, code="JSMI1")
    db.add(seller)
    db.commit()
    for n in range(10000, 10105):
        _add_item(db, seller, str(n))
    assert next_item_code(db) == "10105"


def test_item_code_ignores_legacy_alphanumeric_codes(db, active_event):
    """Grandfathered codes like EJOH11 / ABC-001 do not move the numeric
    counter: the first new numeric id is still 10000."""
    seller = Seller(event_id=active_event.id, code="JSMI1")
    db.add(seller)
    db.commit()
    _add_item(db, seller, "EJOH11")
    _add_item(db, seller, "ABC-001")
    assert next_item_code(db) == "10000"


def test_item_code_skips_legacy_numeric_below_10000(db, active_event):
    """A legacy numeric code below 10000 (e.g. "500") does not shift the
    start: the counter still opens at 10000."""
    seller = Seller(event_id=active_event.id, code="JSMI1")
    db.add(seller)
    db.commit()
    _add_item(db, seller, "500")
    assert next_item_code(db) == "10000"


def test_item_code_skips_reserved_codes_for_batches(db, active_event):
    """Bulk import reserves codes generated earlier in the same uncommitted
    batch via the ``reserved`` set (pending rows are invisible to queries)."""
    assert next_item_code(db, reserved={"10000", "10001"}) == "10002"


def test_item_code_exhaustion_raises_valueerror(db, active_event):
    seller = Seller(event_id=active_event.id, code="JSMI1")
    db.add(seller)
    db.commit()
    _add_item(db, seller, "99999")
    import pytest

    with pytest.raises(ValueError):
        next_item_code(db)
