"""Tests for true transaction editing (docs/superpowers/specs/
2026-10-25-transaction-editing-design.md): cashier/admin line add/update/
remove + payment/info correction, with the ownership rule (D1: cashiers edit
OWN sales only, admins any), zero-line sale prevention (D8), stock
invariants, checkout-identical total recomputation, and the `sale_edit`
audit trail."""

import pytest

from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller


# ── Fixtures (mirrors test_sales.py) ──────────────────────────────────────────

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
    i = Intake(seller_id=seller.id, donate_proceeds=False, donate_unsold=False, created_by="admin")
    db.add(i)
    db.commit()
    db.refresh(i)
    return i


@pytest.fixture
def donate_intake(db, seller):
    i = Intake(seller_id=seller.id, donate_proceeds=True, donate_unsold=False, created_by="admin")
    db.add(i)
    db.commit()
    db.refresh(i)
    return i


def _make_item(db, intake, code, price, quantity=1, remaining=None, is_deleted=False):
    it = Item(
        intake_id=intake.id,
        seller_id=intake.seller_id,
        code=code,
        price=price,
        quantity=quantity,
        remaining=quantity if remaining is None else remaining,
        status="available",
        label_printed=False,
        is_deleted=is_deleted,
        created_by="admin",
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


@pytest.fixture
def item(db, intake):  # $20, single unit
    return _make_item(db, intake, "ABC-001", 20.00)


@pytest.fixture
def item2(db, intake):  # $15, single unit
    return _make_item(db, intake, "ABC-002", 15.00)


@pytest.fixture
def big_item(db, intake):  # $10 each, 10 units on hand
    return _make_item(db, intake, "ABC-010", 10.00, quantity=10)


@pytest.fixture
def donate_item(db, donate_intake):  # $30, donate_proceeds intake
    return _make_item(db, donate_intake, "ABC-004", 30.00)


@pytest.fixture
def sale(client, cashier_token, item, item2):
    """A completed 2-line sale by cashier1: item @20 + item2 @15 = $35."""
    resp = client.post(
        "/sales",
        json={
            "items": [{"item_id": item.id}, {"item_id": item2.id}],
            "cash_amount": 35.00,
        },
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture
def cashier2_token(registry_db, active_event):
    from app.models.registry import RegistryUser
    from app.services.auth import create_access_token, hash_password

    user = RegistryUser(
        username="cashier2",
        password_hash=hash_password("cashier123"),
        role="cashier",
        is_active=True,
    )
    registry_db.add(user)
    registry_db.commit()
    registry_db.refresh(user)
    return create_access_token(user.id, user.username, user.role, active_event.id)


def _hr(token):
    return {"Authorization": f"Bearer {token}"}


def _edits(client, sale_id, token):
    return client.get(f"/sales/{sale_id}/edits", headers=_hr(token))


# ── Ownership & roles (D1) ────────────────────────────────────────────────────

def test_cashier_edits_own_sale_payments(client, cashier_token, active_event, sale):
    resp = client.patch(
        f"/sales/{sale['id']}",
        json={"customer_name": "Ann Example"},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 200
    assert resp.json()["customer_name"] == "Ann Example"


def test_cashier_cannot_edit_another_cashiers_sale(
    client, cashier2_token, active_event, sale, item
):
    sid = sale["id"]
    assert (
        client.patch(f"/sales/{sid}", json={"notes": "x"}, headers=_hr(cashier2_token)).status_code
        == 403
    )
    assert (
        client.post(
            f"/sales/{sid}/lines", json={"item_id": item.id}, headers=_hr(cashier2_token)
        ).status_code
        == 403
    )
    line_id = client.get(f"/sales/{sid}", headers=_hr(cashier2_token)).json()["sale_items"][0]["id"]
    assert (
        client.patch(
            f"/sales/{sid}/lines/{line_id}", json={"quantity": 1}, headers=_hr(cashier2_token)
        ).status_code
        == 403
    )
    assert (
        client.delete(f"/sales/{sid}/lines/{line_id}", headers=_hr(cashier2_token)).status_code
        == 403
    )
    assert _edits(client, sid, cashier2_token).status_code == 403


def test_admin_edits_any_cashiers_sale(client, admin_token, active_event, sale):
    resp = client.patch(
        f"/sales/{sale['id']}",
        json={"notes": "fixed by admin"},
        headers=_hr(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["notes"] == "fixed by admin"


def test_intake_role_cannot_edit(client, intake_token, active_event, sale):
    resp = client.patch(f"/sales/{sale['id']}", json={"notes": "x"}, headers=_hr(intake_token))
    assert resp.status_code == 403


def test_cashier_intake_edits_own_sale(client, cashier_intake_token, active_event, item, db, intake):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}], "cash_amount": 20.00},
        headers=_hr(cashier_intake_token),
    )
    assert resp.status_code == 201
    sid = resp.json()["id"]
    assert (
        client.patch(f"/sales/{sid}", json={"notes": "own"}, headers=_hr(cashier_intake_token)).status_code
        == 200
    )


def test_unknown_sale_404_on_edit(client, admin_token, active_event):
    assert client.patch("/sales/99999", json={"notes": "x"}, headers=_hr(admin_token)).status_code == 404


# ── POST /sales/{id}/lines ────────────────────────────────────────────────────

def test_add_line_defaults_price_and_recomputes(client, db, cashier_token, active_event, item, big_item, sale):
    resp = client.post(
        f"/sales/{sale['id']}/lines",
        json={"item_id": big_item.id},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["sale_items"]) == 3
    new_line = data["sale_items"][-1]
    assert new_line["item_code"] == big_item.code
    assert new_line["sell_price"] == 10.00          # default: item.price
    assert new_line["extended_price"] == 10.00
    assert new_line["line_number"] == 3             # appended after 2
    assert data["sale_total"] == 45.00              # 20 + 15 + 10
    assert data["mysl_total"] == 13.50              # per-line 30%: 6 + 4.5 + 3
    assert data["seller_total"] == 31.50
    db.refresh(big_item)
    assert big_item.remaining == 9.0
    assert big_item.status == "sold"


def test_add_line_price_override(client, db, cashier_token, active_event, big_item, sale):
    resp = client.post(
        f"/sales/{sale['id']}/lines",
        json={"item_id": big_item.id, "quantity": 3, "sell_price": 11.00},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 201
    data = resp.json()
    line = data["sale_items"][-1]
    assert line["sell_price"] == 11.00
    assert line["extended_price"] == 33.00
    assert data["sale_total"] == 68.00              # 35 + 33
    assert data["mysl_total"] == 20.40              # 6 + 4.5 + round(33*0.3)
    db.refresh(big_item)
    assert big_item.remaining == 7.0


def test_add_line_duplicate_item_rejected(client, cashier_token, active_event, sale, item):
    resp = client.post(
        f"/sales/{sale['id']}/lines",
        json={"item_id": item.id},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 422
    assert "already on this sale" in resp.json()["detail"]


def test_add_line_unknown_item_404(client, cashier_token, active_event, sale):
    assert (
        client.post(
            f"/sales/{sale['id']}/lines", json={"item_id": 424242}, headers=_hr(cashier_token)
        ).status_code
        == 404
    )


def test_add_line_deleted_item_rejected(client, db, cashier_token, active_event, intake, sale):
    dead = _make_item(db, intake, "ABC-900", 50.0)
    dead.is_deleted = True
    db.commit()
    resp = client.post(
        f"/sales/{sale['id']}/lines", json={"item_id": dead.id}, headers=_hr(cashier_token)
    )
    assert resp.status_code == 422
    assert "deleted" in resp.json()["detail"]


def test_add_line_insufficient_remaining(client, db, cashier_token, active_event, intake, sale):
    low = _make_item(db, intake, "ABC-901", 50.0)  # 1 on hand
    resp = client.post(
        f"/sales/{sale['id']}/lines",
        json={"item_id": low.id, "quantity": 5},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 422
    assert "remaining" in resp.json()["detail"]


# ── PATCH /sales/{id}/lines/{sale_item_id} ────────────────────────────────────

def test_update_line_quantity_increase(client, db, cashier_token, active_event, big_item, sale):
    """Add 2 units of the 10-unit item, then raise that line to 5: 3 more units leave stock."""
    add = client.post(
        f"/sales/{sale['id']}/lines",
        json={"item_id": big_item.id, "quantity": 2},
        headers=_hr(cashier_token),
    )
    assert add.status_code == 201
    line = add.json()["sale_items"][-1]
    db.refresh(big_item)
    assert big_item.remaining == 8.0

    resp = client.patch(
        f"/sales/{sale['id']}/lines/{line['id']}",
        json={"quantity": 5},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["sale_items"][-1]["extended_price"] == 50.00
    assert data["sale_total"] == 85.00           # 20 + 15 + 50
    assert data["mysl_total"] == 25.50           # 6 + 4.5 + 15
    db.refresh(big_item)
    assert big_item.remaining == 5.0
    assert big_item.status == "sold"

def test_update_line_quantity_beyond_stock_rejected(client, cashier_token, active_event, sale):
    line = sale["sale_items"][0]
    resp = client.patch(
        f"/sales/{sale['id']}/lines/{line['id']}",
        json={"quantity": 3},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 422   # item has quantity 1, remaining 0 after sale
    assert "remaining" in resp.json()["detail"]


def test_update_line_quantity_decrease_restores_units(
    client, db, cashier_token, active_event, big_item, item, sale
):
    """Sell 5 units of the 10-unit item, then drop the line to 2: 3 units come back."""
    add = client.post(
        f"/sales/{sale['id']}/lines",
        json={"item_id": big_item.id, "quantity": 5},
        headers=_hr(cashier_token),
    )
    sale_id = sale["id"]
    line = add.json()["sale_items"][-1]
    assert line["quantity"] == 5
    db.refresh(big_item)
    assert big_item.remaining == 5.0

    resp = client.patch(
        f"/sales/{sale_id}/lines/{line['id']}",
        json={"quantity": 2},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["sale_items"][-1]["extended_price"] == 20.00
    assert data["sale_total"] == 55.00           # 20 + 15 + 20
    db.refresh(big_item)
    assert big_item.remaining == 8.0             # 5 + 3 restored
    assert big_item.status == "sold"             # still: one sale line references it


def test_update_line_restore_beyond_intake_quantity_rejected(
    client, db, cashier_token, active_event, big_item, sale
):
    """Defensive invariant: if the intake quantity shrank under an existing
    sale line, lowering the line must refuse to re-stock past intake quantity."""
    add = client.post(
        f"/sales/{sale['id']}/lines",
        json={"item_id": big_item.id, "quantity": 5},
        headers=_hr(cashier_token),
    )
    assert add.status_code == 201
    line = add.json()["sale_items"][-1]
    big_item.quantity = 2.0   # simulate a shrunken intake under the live sale
    db.commit()
    resp = client.patch(
        f"/sales/{sale['id']}/lines/{line['id']}",
        json={"quantity": 1},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 422
    assert "intake quantity" in resp.json()["detail"]


def test_update_line_zero_quantity_rejected(client, cashier_token, active_event, sale):
    line = sale["sale_items"][0]
    resp = client.patch(
        f"/sales/{sale['id']}/lines/{line['id']}",
        json={"quantity": 0},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 422   # ge=1 — remove the line instead


def test_update_line_price_change_recomputes_totals(client, cashier_token, active_event, sale):
    line = sale["sale_items"][1]  # item2 at 15
    resp = client.patch(
        f"/sales/{sale['id']}/lines/{line['id']}",
        json={"sell_price": 40.00},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["sale_total"] == 60.00           # 20 + 40
    assert data["mysl_total"] == 18.00           # 6 + 12
    assert data["seller_total"] == 42.00


def test_update_line_notes_only(client, cashier_token, active_event, sale):
    line = sale["sale_items"][0]
    resp = client.patch(
        f"/sales/{sale['id']}/lines/{line['id']}",
        json={"notes": "was 22 in basket"},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 200
    assert resp.json()["sale_items"][0]["notes"] == "was 22 in basket"
    assert resp.json()["sale_total"] == 35.00    # totals unchanged


def test_update_line_no_changes_no_audit(client, cashier_token, active_event, sale):
    line = sale["sale_items"][0]
    resp = client.patch(
        f"/sales/{sale['id']}/lines/{line['id']}",
        json={},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 200
    assert _edits(client, sale["id"], cashier_token).json() == []


def test_update_line_commission_on_donate_item(
    client, cashier_token, active_event, donate_item, db, donate_intake
):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": donate_item.id}], "cash_amount": 30.00},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 201
    sid = resp.json()["id"]
    assert resp.json()["mysl_total"] == 30.00    # whole price to MYSL
    line = resp.json()["sale_items"][0]
    edit = client.patch(
        f"/sales/{sid}/lines/{line['id']}",
        json={"sell_price": 10.00},
        headers=_hr(cashier_token),
    )
    assert edit.status_code == 200
    assert edit.json()["mysl_total"] == 10.00    # still 100% to MYSL
    assert edit.json()["seller_total"] == 0.0


def test_unknown_line_404(client, cashier_token, active_event, sale):
    base = f"/sales/{sale['id']}/lines/99999"
    assert client.patch(base, json={"quantity": 1}, headers=_hr(cashier_token)).status_code == 404
    assert client.delete(base, headers=_hr(cashier_token)).status_code == 404


# ── DELETE /sales/{id}/lines/{sale_item_id} ───────────────────────────────────

def test_remove_line_restores_units_renumbers_recomputes(
    client, db, cashier_token, active_event, item, item2, sale
):
    sid, line = sale["id"], sale["sale_items"][0]
    resp = client.delete(f"/sales/{sid}/lines/{line['id']}", headers=_hr(cashier_token))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["sale_items"]) == 1
    assert data["sale_items"][0]["line_number"] == 1        # renumbered
    assert data["sale_total"] == 15.00
    assert data["mysl_total"] == 4.50
    db.refresh(item)
    assert item.remaining == 1.0
    assert item.status == "available"                        # no non-voided lines left


def test_remove_line_last_line_forbidden(client, cashier_token, active_event, item):
    sale_one = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}], "cash_amount": 20.00},
        headers=_hr(cashier_token),
    ).json()
    line = sale_one["sale_items"][0]
    resp = client.delete(
        f"/sales/{sale_one['id']}/lines/{line['id']}", headers=_hr(cashier_token)
    )
    assert resp.status_code == 422
    assert "void it instead" in resp.json()["detail"]
    assert item.status == "sold"                              # untouched


def test_remove_line_partial_quantity_item_restores_all(
    client, db, cashier_token, active_event, big_item, sale
):
    add = client.post(
        f"/sales/{sale['id']}/lines",
        json={"item_id": big_item.id, "quantity": 6},
        headers=_hr(cashier_token),
    )
    line = add.json()["sale_items"][-1]
    resp = client.delete(f"/sales/{sale['id']}/lines/{line['id']}", headers=_hr(cashier_token))
    assert resp.status_code == 200
    db.refresh(big_item)
    assert big_item.remaining == 10.0
    assert big_item.status == "available"


# ── PATCH /sales/{id} (payments & info) ──────────────────────────────────────

def test_update_payments_recompute_totals(client, cashier_token, active_event, sale):
    resp = client.patch(
        f"/sales/{sale['id']}",
        json={
            "cash_amount": 10.00,
            "check_amount": 25.00,
            "check_number": "1001",
            "cc_amount": 0.00,
        },
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["cash_amount"] == 10.00
    assert data["check_amount"] == 25.00
    assert data["check_number"] == "1001"
    assert data["total_paid"] == 35.00
    assert data["balance_due"] == 0.0
    assert data["sale_total"] == 35.00


def test_update_card_payment_recomputes_fee_and_totals(
    client, cashier_token, active_event, item, item2
):
    created = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}, {"item_id": item2.id}], "cc_amount": 36.05},
        headers=_hr(cashier_token),
    ).json()
    # 35.00 of items × 1.03 = 36.05 terminal charge → fee 1.05
    assert created["cc_fee"] == 1.05
    assert created["sale_total"] == 36.05

    resp = client.patch(
        f"/sales/{created['id']}", json={"cc_amount": 15.45}, headers=_hr(cashier_token)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["cc_fee"] == 0.45
    assert data["sale_total"] == 35.45     # 35.00 items + 0.45 fee
    assert data["mysl_total"] == 10.95     # 10.50 commission + 0.45 fee
    assert data["seller_total"] == 24.50   # untouched by the fee
    assert data["total_paid"] == 15.45
    assert data["balance_due"] == 20.00


def test_add_line_keeps_card_fee_in_totals(client, cashier_token, active_event, item, item2):
    created = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}], "cc_amount": 20.60},
        headers=_hr(cashier_token),
    ).json()
    assert created["cc_fee"] == 0.60

    resp = client.post(
        f"/sales/{created['id']}/lines",
        json={"item_id": item2.id},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["cc_fee"] == 0.60          # recorded card charge unchanged
    assert data["sale_total"] == 35.60     # 20 + 15 items + 0.60 fee
    assert data["mysl_total"] == 11.10     # 6 + 4.5 commission + 0.60 fee
    assert data["seller_total"] == 24.50


def test_update_payments_overpay_negative_balance_due(client, cashier_token, active_event, sale):
    resp = client.patch(
        f"/sales/{sale['id']}",
        json={"cash_amount": 40.00},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 200
    assert resp.json()["balance_due"] == -5.00    # $5 change handed back


def test_update_payments_negative_amount_rejected(client, cashier_token, active_event, sale):
    resp = client.patch(
        f"/sales/{sale['id']}", json={"cash_amount": -1.0}, headers=_hr(cashier_token)
    )
    assert resp.status_code == 422


def test_update_check_without_number_rejected(client, cashier_token, active_event, sale):
    resp = client.patch(
        f"/sales/{sale['id']}", json={"check_amount": 25.0}, headers=_hr(cashier_token)
    )
    assert resp.status_code == 422
    assert "check_number" in resp.json()["detail"]


def test_update_info_fields(client, cashier_token, active_event, sale):
    resp = client.patch(
        f"/sales/{sale['id']}",
        json={"customer_name": "Bee Example", "customer_email": "bee@example.com", "notes": "gift wrap"},
        headers=_hr(cashier_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["customer_name"] == "Bee Example"
    assert data["customer_email"] == "bee@example.com"
    assert data["notes"] == "gift wrap"
    assert data["total_paid"] == 35.00            # payment untouched


# ── Voided sales are immutable ───────────────────────────────────────────────

def test_voided_sale_rejects_all_edit_routes(client, admin_token, cashier_token, active_event, sale, item):
    sid = sale["id"]
    assert client.post(f"/sales/{sid}/void", headers=_hr(admin_token)).status_code == 200
    assert client.patch(f"/sales/{sid}", json={"notes": "x"}, headers=_hr(cashier_token)).status_code == 409
    assert (
        client.post(
            f"/sales/{sid}/lines", json={"item_id": item.id}, headers=_hr(cashier_token)
        ).status_code
        == 409
    )
    line_id = sale["sale_items"][0]["id"]
    assert (
        client.patch(
            f"/sales/{sid}/lines/{line_id}", json={"quantity": 1}, headers=_hr(cashier_token)
        ).status_code
        == 409
    )
    assert (
        client.delete(f"/sales/{sid}/lines/{line_id}", headers=_hr(cashier_token)).status_code
        == 409
    )
    # History stays READABLE for voided sales (mutations are what's blocked).
    history = _edits(client, sid, cashier_token)
    assert history.status_code == 200
    assert history.json() == []  # this sale was never edited before the void


def test_void_after_edit_keeps_history(client, admin_token, cashier_token, active_event, sale, big_item):
    sid = sale["id"]
    add = client.post(
        f"/sales/{sid}/lines", json={"item_id": big_item.id}, headers=_hr(cashier_token)
    ).json()
    line = add["sale_items"][-1]
    client.delete(f"/sales/{sid}/lines/{line['id']}", headers=_hr(cashier_token))
    assert client.post(f"/sales/{sid}/void", headers=_hr(admin_token)).status_code == 200
    history = _edits(client, sid, cashier_token)
    assert history.status_code == 200
    assert [e["action"] for e in history.json()][:2] == ["remove_line", "add_line"]


# ── Audit history ─────────────────────────────────────────────────────────────

def test_edit_history_newest_first_with_payloads(client, cashier_token, active_event, sale, big_item, db):
    sid = sale["id"]
    client.patch(
        f"/sales/{sid}", json={"customer_name": "Cara"}, headers=_hr(cashier_token)
    )
    add = client.post(
        f"/sales/{sid}/lines", json={"item_id": big_item.id}, headers=_hr(cashier_token)
    ).json()
    new_line = add["sale_items"][-1]
    client.patch(
        f"/sales/{sid}/lines/{new_line['id']}", json={"sell_price": 12.0}, headers=_hr(cashier_token)
    )
    client.delete(f"/sales/{sid}/lines/{new_line['id']}", headers=_hr(cashier_token))

    history = _edits(client, sid, cashier_token).json()
    assert [e["action"] for e in history] == ["remove_line", "update_line", "add_line", "update_info"]
    removed = history[0]
    assert removed["before"]["item_code"] == big_item.code
    assert removed["before"]["extended_price"] == 12.00
    assert removed["after"] is None
    updated = history[1]
    assert updated["before"]["sell_price"] == 10.00
    assert updated["after"]["sell_price"] == 12.00
    added = history[2]
    assert added["before"] is None
    assert added["after"]["item_code"] == big_item.code
    assert {e["edited_by"] for e in history} == {"cashier1"}


# ── GET /sales (admin list) ───────────────────────────────────────────────────

def test_admin_list_sales_filters_and_voided(client, admin_token, cashier2_token, cashier_token, active_event, item, db, intake):
    s1 = client.post(
        "/sales", json={"items": [{"item_id": item.id}], "cash_amount": 20.0},
        headers=_hr(cashier_token),
    ).json()
    item_b = _make_item(db, intake, "ABC-002", 15.0)
    s2 = client.post(
        "/sales", json={"items": [{"item_id": item_b.id}], "cash_amount": 15.0},
        headers=_hr(cashier2_token),
    ).json()
    client.post(f"/sales/{s2['id']}/void", headers=_hr(admin_token))

    resp = client.get("/sales", headers=_hr(admin_token))
    assert resp.status_code == 200
    ids = [s["id"] for s in resp.json()]
    assert ids == [s1["id"]]                       # voided excluded by default
    mine = client.get("/sales?created_by=cashier2&include_voided=true", headers=_hr(admin_token))
    assert [s["id"] for s in mine.json()] == [s2["id"]]
    assert mine.json()[0]["is_voided"] is True


def test_admin_list_sales_pagination(client, admin_token, cashier_token, active_event, item, big_item):
    client.post("/sales", json={"items": [{"item_id": item.id}], "cash_amount": 20.0}, headers=_hr(cashier_token))
    client.post("/sales", json={"items": [{"item_id": big_item.id}], "cash_amount": 10.0}, headers=_hr(cashier_token))
    page = client.get("/sales?limit=1&offset=1", headers=_hr(admin_token))
    assert page.status_code == 200
    assert len(page.json()) == 1


def test_admin_list_sales_non_admin_403(client, cashier_token, active_event):
    assert client.get("/sales", headers=_hr(cashier_token)).status_code == 403


def _hr(token):
    return {"Authorization": f"Bearer {token}"}