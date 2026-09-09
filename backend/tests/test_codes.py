"""Tests for item/seller code generation (app/services/codes.py).

Covers the name-derived seller code scheme ("Jane Smith" -> "JSMI1") and the
globally-unique numeric-suffix behaviour, including the Jane/Joan/John Smith
cluster, vendor company names, accented names, and cross-event uniqueness.
Also covers item-code generation: seller code + unpadded sequence number,
including the prefix-extension collision case (seller "JSMI1" vs "JSMI11").
"""

from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller
from app.services.codes import next_item_code, next_item_seq, next_seller_code, seller_code_prefix


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

def _add_item(db: Session, seller: Seller, seq: int, code: str | None = None) -> None:
    intake = Intake(seller_id=seller.id)
    db.add(intake)
    db.flush()
    db.add(Item(intake_id=intake.id, seller_id=seller.id,
                code=code or f"{seller.code}{seq}", price=10.0))
    db.commit()


def test_item_code_combines_seller_code_and_unpadded_sequence(db, active_event):
    seller = Seller(event_id=active_event.id, code="JSMI1")
    db.add(seller)
    db.commit()
    code = next_item_code(db, seller)
    assert code == "JSMI11"
    assert "-" not in code
    prefix = f"{seller.code}"
    seq = code[len(prefix):]
    assert seq == "1" and not seq.startswith("0")  # no leading zeros
    assert len(code) <= 10


def test_item_code_sequence_bumps_past_taken_codes(db, active_event):
    """Seller JSMI1 with items 1-5 -> next is 6 (no reuse, no leading zeros)."""
    seller = Seller(event_id=active_event.id, code="JSMI1")
    db.add(seller)
    db.commit()
    for seq in range(1, 6):
        _add_item(db, seller, seq)
    assert next_item_code(db, seller) == "JSMI16"


def test_item_code_skips_prefix_extension_collision(db, active_event):
    """THE edge case: seller "JSMI1" item 11 -> "JSMI111", which collides with
    seller "JSMI11" item 1. Generation must bump past taken codes."""
    s1 = Seller(event_id=active_event.id, code="JSMI1")
    s11 = Seller(event_id=active_event.id, code="JSMI11")
    db.add_all([s1, s11])
    db.commit()
    _add_item(db, s11, 1)  # takes "JSMI111" (seller JSMI11 + seq 1)
    for seq in range(1, 11):
        _add_item(db, s1, seq)  # takes "JSMI11".."JSMI110"
    assert next_item_code(db, s1) == "JSMI112"


def test_item_code_numeric_only_for_long_sequences(db, active_event):
    seller = Seller(event_id=active_event.id, code="AB1")
    db.add(seller)
    db.commit()
    for seq in range(1, 4):
        _add_item(db, seller, seq)
    assert next_item_code(db, seller) == "AB14"