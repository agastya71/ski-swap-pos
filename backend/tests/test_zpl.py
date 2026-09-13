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


# ── Explicit copies ("print a specified number of labels per item") ──────────

def test_generate_zpl_explicit_copies_overrides_remaining(item):
    from app.services.zpl import generate_zpl
    item.remaining = 5
    zpl = generate_zpl(item, copies=3)
    assert "^PQ3" in zpl
    assert "^PQ5" not in zpl


def test_generate_zpl_copies_one_emits_no_pq_command(item):
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item, copies=1)
    assert "^PQ" not in zpl


def test_generate_zpl_default_copies_uses_remaining(item):
    from app.services.zpl import generate_zpl
    item.remaining = 4
    zpl = generate_zpl(item)
    assert "^PQ4" in zpl


def test_print_label_with_copies_param(client, admin_token, item):
    with patch("app.routers.items.send_to_printer") as mock_send:
        resp = client.post(
            f"/items/{item.id}/label?copies=3",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    zpl_sent = mock_send.call_args[0][0]
    assert "^PQ3" in zpl_sent
    assert resp.json()["label_printed"] is True


def test_print_label_copies_zero_returns_422(client, admin_token, item):
    with patch("app.routers.items.send_to_printer") as mock_send:
        resp = client.post(
            f"/items/{item.id}/label?copies=0",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 422
    assert not mock_send.called


def test_generate_zpl_code_as_text_replaces_barcode(item):
    """code_as_text renders the item code as large text instead of a barcode."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item, code_as_text=True)
    assert "^BCN" not in zpl
    assert "^A0N,50,50" in zpl
    assert "ABC-001" in zpl


def test_generate_zpl_code_as_text_keeps_item_details(item):
    """Text-code mode keeps the seller code, price, and detail lines."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item, code_as_text=True)
    assert "25.00" in zpl
    assert "Size 8" in zpl
    assert "Adult" in zpl
    assert zpl.strip().startswith("^XA")
    assert zpl.strip().endswith("^XZ")


def test_generate_zpl_code_as_text_respects_copies(item):
    """Explicit copies still works together with text-code mode."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item, copies=3, code_as_text=True)
    assert "^PQ3\n^XZ" in zpl
    assert "^BCN" not in zpl


def test_print_single_label_code_as_text(client, admin_token, item):
    """?code_as_text=true sends a text-code label (no barcode) for the item."""
    with patch("app.routers.items.send_to_printer") as mock_send:
        resp = client.post(
            f"/items/{item.id}/label?code_as_text=true",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    zpl = mock_send.call_args.args[0]
    assert "^BCN" not in zpl
    assert "ABC-001" in zpl


def test_print_batch_labels_code_as_text(client, admin_token, intake, item):
    """?code_as_text=true applies to every label in the intake batch."""
    with patch("app.routers.intakes.send_to_printer") as mock_send:
        resp = client.post(
            f"/intakes/{intake.id}/labels?code_as_text=true",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["printed"] == 1
    for call in mock_send.call_args_list:
        assert "^BCN" not in call.args[0]
        assert "ABC-001" in call.args[0]


# ── Explicit format commands + printer delivery (ZD421 findings 2026-09-12) ──


def test_generate_zpl_emits_explicit_format_commands(item):
    """^MD/^LL/^LS/^PW/^CI0 are emitted on every label — the ZD421 prints
    BLANK without them (its stored settings), measured on the live printer."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item)
    assert "^MD20" in zpl
    assert "^LL203" in zpl
    assert "^LS" not in zpl  # ^FT fields ignore the label shift — the origin is baked into x
    assert "^PW850" in zpl
    assert "^CI0" in zpl


def test_generate_zpl_code_as_text_also_carries_format_commands(item):
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item, code_as_text=True)
    assert "^PW850" in zpl
    assert "^MD20" in zpl
    assert "^BCN" not in zpl


def test_send_to_printer_writes_device_without_cups(tmp_path):
    """A writable device path is used directly — no CUPS call."""
    from app.services import zpl
    target = tmp_path / "lp0"
    target.write_bytes(b"")
    with patch("app.services.zpl.subprocess.run") as mock_run:
        zpl.send_to_printer("^XA^XZ\n", printer_path=str(target))
    assert not mock_run.called
    assert target.read_bytes() == b"^XA^XZ\n"


def test_send_to_printer_falls_back_to_cups(tmp_path):
    """Missing device → the CUPS queue receives the ZPL via `lp -o raw`."""
    from app.services import zpl
    # parent dir does not exist → open() raises FileNotFoundError like a real
    # missing device node
    missing = str(tmp_path / "no-such-dir" / "lp0")
    with patch("app.services.zpl.subprocess.run") as mock_run:
        mock_run.return_value.returncode = 0
        zpl.send_to_printer("^XA^XZ\n", printer_path=missing)
    assert mock_run.called
    assert mock_run.call_args.args[0][:4] == ["lp", "-d", "ZTC-ZD421-203dpi-ZPL", "-o"]
    assert mock_run.call_args.kwargs["input"] == b"^XA^XZ\n"


def test_send_to_printer_cups_unavailable_raises_oserror(tmp_path):
    """Device missing AND CUPS unavailable → OSError (endpoints map to 503)."""
    from app.services import zpl
    missing = str(tmp_path / "no-such-dir" / "lp0")
    with patch("app.services.zpl.subprocess.run", side_effect=FileNotFoundError("no lp")):
        with pytest.raises(OSError, match="Label printer unavailable"):
            zpl.send_to_printer("^XA^XZ\n", printer_path=missing)


# ── Layout: price top-left, identifier top-right, event name between ─────────


def test_generate_zpl_price_top_left_and_identifier_top_right(item):
    """Price prints top-left (^FT top-anchored); the barcode is right-aligned
    (user-requested arrangement, 2026-09-12; width 625). For a 7-char code the
    right-aligned origin is 625 - (9*30 + 8*2 + 40) = 299 dots."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item)
    assert "^FT280,38^A0N,30,30^FD$25.00^FS" in zpl
    assert "^FO524,5^BCN,70,N,N,N^FDABC-001^FS" in zpl


def test_generate_zpl_user_id_below_price(item):
    """The user id (seller code) prints below the price on the left, top-
    anchored via ^FT."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item)
    assert "^FT280,144^A0N,24,24^FDABC^FS" in zpl


def test_generate_zpl_prints_event_name(item):
    """The event name prints centered on its own row between the identifier
    band and the info block (in-band placement would collide with the
    barcode for 7+ char codes)."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item, event_name="Ski Swap 2026")
    assert "^FT280,118^FB570,1,0,C,0^A0N,22,22^FDSki Swap 2026^FS" in zpl


def test_generate_zpl_text_mode_code_top_right(item):
    """Text-mode item code sits in the barcode's place (top-right, right-
    aligned via ^FB) with the same event/price/user-id arrangement."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item, code_as_text=True, event_name="Ski Swap 2026")
    assert "^FT280,55^FB570,1,0,R,0^A0N,50,50^FDABC-001^FS" in zpl
    assert "^FDSki Swap 2026^FS" in zpl
    assert "^BCN" not in zpl
