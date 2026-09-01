import datetime
import pytest
from unittest.mock import patch
from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller


@pytest.fixture
def seller(db, active_event):
    s = Seller(
        event_id=active_event.id,
        code="ABC",
        first_name="Jane",
        last_name="Smith",
        is_vendor=False,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@pytest.fixture
def intake(db, seller):
    i = Intake(
        seller_id=seller.id,
        date_entered=datetime.date.today(),
        donate_unsold=False,
        donate_proceeds=False,
    )
    db.add(i)
    db.commit()
    db.refresh(i)
    return i


@pytest.fixture
def item(db, intake, seller):
    it = Item(
        intake_id=intake.id,
        seller_id=seller.id,
        code="ABC-001",
        price=25.00,
        description="Ski boots",
        label_line_2="Size 8",
        label_line_3="Adult",
        barcode_39="ABC-001",
        status="available",
        label_printed=False,
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


# ── ZPL generation unit tests (no HTTP, no mocking) ─────────────────────────

def test_generate_zpl_contains_barcode(item):
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item)
    assert "ABC-001" in zpl
    assert "^BCN" in zpl


def test_generate_zpl_contains_price(item):
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item)
    assert "25.00" in zpl


def test_generate_zpl_contains_seller_code(item):
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item)
    assert "ABC" in zpl


def test_generate_zpl_contains_label_lines(item):
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item)
    assert "Size 8" in zpl
    assert "Adult" in zpl


def test_generate_zpl_starts_and_ends_with_markers(item):
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item)
    assert zpl.strip().startswith("^XA")
    assert zpl.strip().endswith("^XZ")


# ── Label endpoint tests ─────────────────────────────────────────────────────

def test_print_single_label_success(client, admin_token, item):
    with patch("app.routers.items.send_to_printer") as mock_send:
        resp = client.post(
            f"/items/{item.id}/label",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    assert mock_send.called
    assert resp.json()["label_printed"] is True


def test_print_single_label_sets_label_printed_in_db(client, admin_token, db, item):
    with patch("app.routers.items.send_to_printer"):
        client.post(f"/items/{item.id}/label", headers={"Authorization": f"Bearer {admin_token}"})
    db.refresh(item)
    assert item.label_printed is True


def test_print_single_label_printer_unavailable_returns_503(client, admin_token, item):
    with patch("app.routers.items.send_to_printer", side_effect=OSError("no printer")):
        resp = client.post(
            f"/items/{item.id}/label",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 503


def test_print_batch_labels_success(client, admin_token, intake, item):
    with patch("app.routers.intakes.send_to_printer") as mock_send:
        resp = client.post(
            f"/intakes/{intake.id}/labels",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    assert mock_send.call_count == 1
    assert resp.json()["printed"] == 1


def test_print_batch_labels_empty_intake(client, admin_token, intake):
    with patch("app.routers.intakes.send_to_printer"):
        resp = client.post(
            f"/intakes/{intake.id}/labels",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["printed"] == 0


def test_print_batch_labels_sets_label_printed_in_db(client, admin_token, db, intake, item):
    with patch("app.routers.intakes.send_to_printer"):
        client.post(f"/intakes/{intake.id}/labels", headers={"Authorization": f"Bearer {admin_token}"})
    db.refresh(item)
    assert item.label_printed is True


def test_print_batch_labels_printer_error_returns_503(client, admin_token, intake, item):
    with patch("app.routers.intakes.send_to_printer", side_effect=OSError("no printer")):
        resp = client.post(
            f"/intakes/{intake.id}/labels",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 503


def test_generate_zpl_prints_quantity_copies(item):
    """generate_zpl emits an ^PQ command for items with quantity > 1 (N labels
    per N units — one tag per physical unit, same item code)."""
    from app.services.zpl import generate_zpl
    item.remaining = 3
    zpl = generate_zpl(item)
    assert "^PQ3\n^XZ" in zpl


def test_generate_zpl_no_copies_command_for_single_quantity(item):
    """generate_zpl omits ^PQ for the common quantity == 1 case."""
    from app.services.zpl import generate_zpl
    item.remaining = 1
    zpl = generate_zpl(item)
    assert "^PQ" not in zpl
    assert zpl.endswith("^XZ\n")
