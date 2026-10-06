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


@pytest.fixture
def clean_item(db, intake, seller):
    """Item WITHOUT the optional free-text lines — the reference-photo
    (MYSL 2020) regime with the full-size lower rows + category/size."""
    it = Item(
        intake_id=intake.id,
        seller_id=seller.id,
        code="ABC-002",
        price=25.00,
        description="Ski boots",
        category="Poles",
        size="115cm",
        barcode_39="ABC-002",
        status="available",
        label_printed=False,
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


# ── ZPL generation unit tests (no HTTP, no mocking) ─────────────────────────

import re as _re


def _field_coords(zpl: str) -> list[tuple[int, int]]:
    """Extract (x, y) from every ^FO/^FT field position, in output order."""
    return [
        (int(m[0]), int(m[1]))
        for m in _re.findall(r"\^(?:FO|FT)(-?\d+),(-?\d+)", zpl)
    ]


def test_generate_zpl_dx_dy_shifts_every_field(item):
    """dx=-3/dy=3 ( Browser-Print agent nudge ) moves EVERY PRINTED field:
    x-3, y+3. Since v7 the +3 dy stacks on the global LABEL_DOWN_DOTS=4
    (dy_eff=7): a field pushed past the 1" ink window by the nudge is
    dropped by the fit guard (drops take the BOTTOM rows only), so the
    comparison covers the surviving prefix of the base field list."""
    from app.services.zpl import generate_zpl

    base = _field_coords(generate_zpl(item))
    shifted = _field_coords(generate_zpl(item, dx=-3, dy=3))
    assert 0 < len(shifted) <= len(base)
    for (x0, y0), (x1, y1) in zip(base[:len(shifted)], shifted):
        assert x1 == x0 - 3
        assert y1 == y0 + 3


def test_generate_zpl_zero_offset_is_default(item):
    """dx=dy=0 stays byte-identical — server-attached printing is untouched."""
    from app.services.zpl import generate_zpl

    assert generate_zpl(item, dx=0, dy=0) == generate_zpl(item)


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
    """Free-text lines print while they fit the 1" canvas: line2 survives,
    line3 is dropped (the event-row slot + uniform ID row leave no room)."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item)
    assert "Size 8" in zpl
    assert "Adult" not in zpl


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
    """Text-code mode keeps the seller code, price, and the free-text lines:
    since v6 the flag+price share the seller row (no pitch of their own),
    so the flow rides one pitch higher than v5 and line3 (y=161) now fits
    the 1" canvas too."""
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
    assert "^PW723" in zpl
    assert "^CI0" in zpl


def test_generate_zpl_code_as_text_also_carries_format_commands(item):
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item, code_as_text=True)
    assert "^PW723" in zpl
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


def test_generate_zpl_price_right_column_seller_row(item):
    """The price prints in the RIGHT COLUMN of the seller row (y=120), left
    justified at the barcode's x anchor (2026-10-06 v6 user directive). For
    a 7-char code the anchor is 723 + 20 - (9*30 + 8*2 + 40) = 417 dots —
    the same column edge the barcode and centered ID occupy. The barcode
    itself is unchanged: bars end exactly at 723."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item)
    assert "^FT417,124^A0N,30,30^FD$25.00^FS" in zpl
    assert "^FO417,18^BCN,46,N,N,N^FDABC-001^FS" in zpl


def test_generate_zpl_item_id_row_below_barcode(item):
    """The item identifier repeats at the price's font size, centered under
    the barcode — always one pitch below the event slot, a uniform y on
    every label, full row clear of the bars (print feedback: v2's 5-dot gap
    read as "mixed up with the barcode"). Bars end at y=60; the row is at
    y=93 with or without an event name."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item)
    assert "^FT417,97^FB306,1,0,C,0^A0N,30,30^FDABC-001^FS" in zpl


def test_generate_zpl_user_id_below_price(item):
    """The seller code prints on the left below the identifier row, at the
    price's font size, top-anchored via ^FT."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item)
    assert "^FT147,124^A0N,30,30^FDABC^FS" in zpl


def test_generate_zpl_label_lines_print_while_they_fit(item):
    """The optional free-text lines print at the same 30pt, top-down, while
    they fit the 1" canvas: the event-row slot is reserved (uniform ID row),
    so description lands at 147, line2 at 174 — line3 (201) no longer fits
    and is dropped rather than clipped."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item)
    assert "^FT147,178^A0N,30,30^FDSize 8^FS" in zpl
    assert "Adult" not in zpl


def test_generate_zpl_category_and_size_row(clean_item):
    """Category (uppercased, per the photo) + 'Sz:' size print as their own
    row between the seller code and the description."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(clean_item)
    assert "^FT147,151^A0N,30,30^FDPOLES  Sz: 115cm^FS" in zpl
    assert "^FT147,124^A0N,30,30^FDABC^FS" in zpl
    assert "^FT147,178^A0N,30,30^FDSki boots^FS" in zpl


def test_generate_zpl_category_size_row_skipped_when_absent(item):
    """No category/size → the row is omitted and the description moves up."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item)
    assert "Sz: " not in zpl
    assert "^FT147,151^A0N,30,30^FDSki boots^FS" in zpl


def test_generate_zpl_prints_event_name(item):
    """The event name takes the price's OLD top-band slot (y=33) — left
    column at the price's font size (2026-10-06 user directive; supersedes
    the 2026-09-28 below-the-price placement) — and consumes no row: the
    seller flows directly below the uniform ID row."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item, event_name="Ski Swap 2026")
    assert "^FT147,37^A0N,30,30^FDSki Swap 2026^FS" in zpl
    assert "^FT417,97^FB306,1,0,C,0^A0N,30,30^FDABC-001^FS" in zpl
    assert "^FT147,124^A0N,30,30^FDABC^FS" in zpl


def test_generate_zpl_event_row_drops_overflowing_lines(item):
    """The event row costs NO lower row (it sits at y=33 in the price's old
    slot), so the lower flow is identical with or without an event name:
    the description fits at 147 and line2 at 174; line3 (201) is dropped."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item, event_name="Ski Swap 2026")
    assert "^FT147,151^A0N,30,30^FDSki boots^FS" in zpl
    assert "^FT147,178^A0N,30,30^FDSize 8^FS" in zpl
    assert "Adult" not in zpl


def test_generate_zpl_event_in_price_slot_in_both_modes(item):
    """The event name ALWAYS prints in the price's old top-band slot (y=33)
    — left column beside the barcode/big code, above the price — in both
    barcode and text modes."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item, event_name="MYSL 2020")
    assert "^FT147,37^A0N,30,30^FDMYSL 2020^FS" in zpl
    zpl = generate_zpl(item, code_as_text=True, event_name="MYSL 2020")
    assert "^FT147,37^A0N,30,30^FDMYSL 2020^FS" in zpl


def test_generate_zpl_text_mode_code_top_right(item):
    """Text-mode item code sits in the barcode's place (top-right, right-
    aligned via ^FB) with no repeated identifier row below it; the price
    (+ flag) prints on the seller row (y=80), left-justified at the content
    width's midpoint (435) — text mode has no barcode anchor."""
    from app.services.zpl import generate_zpl
    zpl = generate_zpl(item, code_as_text=True, event_name="Ski Swap 2026")
    assert "^FT147,44^FB576,1,0,R,0^A0N,50,50^FDABC-001^FS" in zpl
    assert "^FT147,37^A0N,30,30^FDSki Swap 2026^FS" in zpl
    assert "^FT435,84^A0N,30,30^FD$25.00^FS" in zpl
    assert "^BCN" not in zpl
    assert "^FT417," not in zpl  # no identifier row under the (absent) barcode


def test_generate_zpl_donation_flag_beside_price(item):
    """A donate_unsold item composes the flag INTO the price field: 'D' +
    four spaces + the price, left-justified in the seller row's right
    column (2026-10-06 v6: "a few spaces separating the price and the
    Donate Flag"); the flag leaves the ID row and costs no row either
    way; a non-donate item prints the price alone."""
    from app.services.zpl import generate_zpl
    item.donate_unsold = True
    zpl = generate_zpl(item)
    assert "^FT417,124^A0N,30,30^FDD    $25.00^FS" in zpl
    # the flag left the ID row: the ID is centered there alone, and the
    # seller row keeps its slot (the flag costs no row either way)
    assert "^FT417,97^FB306,1,0,C,0^A0N,30,30^FDABC-001^FS" in zpl
    assert "^FT147,124^A0N,30,30^FDABC^FS" in zpl
    assert "^FT147,97^A0N,30,30^FDD^FS" not in zpl
    item.donate_unsold = False
    zpl = generate_zpl(item)
    assert "^FT417,124^A0N,30,30^FD$25.00^FS" in zpl
    assert "^FT147,124^A0N,30,30^FDABC^FS" in zpl


def test_generate_zpl_price_column_floored_for_long_codes(item):
    """A long item code slides the barcode anchor left — the flag+price
    edge is floored so it can never land under the seller code: for a
    13-char code bx = 743 - (15*30 + 14*2 + 40) = 225, but the floor
    (origin + 180 = 327) wins and the price prints at 327."""
    from app.services.zpl import generate_zpl
    item.code = item.barcode_39 = "LONGCODE-1234"
    zpl = generate_zpl(item)
    assert "^FT327,124^A0N,30,30^FD$25.00^FS" in zpl


def test_generate_zpl_text_mode_donation_flag_rides_price(item):
    """In text mode the flag also composes into the price field (midpoint
    column edge) and consumes NO pitch — the seller keeps y=80 with or
    without it; only the composed text changes."""
    from app.services.zpl import generate_zpl
    item.donate_unsold = True
    zpl = generate_zpl(item, code_as_text=True, event_name="MYSL 2020")
    assert "^FT435,84^A0N,30,30^FDD    $25.00^FS" in zpl
    assert "^FT147,84^A0N,30,30^FDABC^FS" in zpl
    item.donate_unsold = False
    zpl = generate_zpl(item, code_as_text=True, event_name="MYSL 2020")
    assert "^FT435,84^A0N,30,30^FD$25.00^FS" in zpl
    assert "^FT147,84^A0N,30,30^FDABC^FS" in zpl
    assert "^FT147,37^A0N,30,30^FDMYSL 2020^FS" in zpl


def test_generate_zpl_description_truncated_to_20_chars(clean_item):
    """The description truncates at 20 characters (2026-10-06 directive —
    revised from 30); other fields keep the 28-char cap."""
    from app.services.zpl import generate_zpl
    clean_item.description = "Ultra-light racing boots size 26.5 world cup"
    zpl = generate_zpl(clean_item)
    assert "Ultra-light racing b" in zpl                # first 20 chars (hard cut)
    assert "Ultra-light racing boots size 26.5 world cup" not in zpl
    clean_item.description = "x" * 40                   # regenerate for the x-cap check
    zpl = generate_zpl(clean_item)
    assert 20 * "x" in zpl
    assert 21 * "x" not in zpl
