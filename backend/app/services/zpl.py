"""ZPL label generation and printing service.

Generates ZPL II label strings for the Zebra ZD421 (203 dpi) and sends them
via direct USB (pyusb) or a Linux device path, with a CUPS `lp` fallback —
the live deployment's ZD421 is owned by the CUPS queue ``ZTC-ZD421-203dpi-ZPL``
(no raw ``/dev/usb/lp*`` node exists).

Label geometry is measured and explicit (ruler-measured via
``scripts/label_ruler.py``, 2026-09-27; media user-confirmed ≈3" wide × 1"
tall): the media window in ``^FT`` coordinates spans
``LABEL_LEFT_ORIGIN_DOTS`` (≈ 147) to ``LABEL_RIGHT_EDGE_DOTS`` (≈ 723) —
the 2026-09-13 window (~275..830) had drifted/aged out, which clipped the
barcode at the right edge and left the old left origin 130 dots inside the
media. Text fields use ``^FT`` (field top), and ``^LS`` is NOT used:
^FT-positioned fields ignore the label shift, so the left origin is baked
into every x coordinate instead.
"""

import logging
import subprocess
import sys

from app.config import (
    LABEL_DARKNESS,
    LABEL_LENGTH_DOTS,
    LABEL_LEFT_ORIGIN_DOTS,
    LABEL_PRINTER_PATH,
    LABEL_PRINTER_QUEUE,
    LABEL_RIGHT_EDGE_DOTS,
)

_CONTENT_WIDTH = LABEL_RIGHT_EDGE_DOTS - LABEL_LEFT_ORIGIN_DOTS  # ≈ 540 dots
_ZEBRA_VID   = 0x0A5F
_ZEBRA_PID   = 0x0185
def _barcode_x(barcode: str, right: int) -> int:
    """Return the x origin (dots) that RIGHT-aligns the barcode at the
    content right edge (``right``).

    Code 128 geometry at default module width (2 dots, ratio 3.0):
      - each symbol (including start/stop): 30 dots
      - inter-character gap: 2 dots
      - quiet zones (10× narrow bar): 20 dots each side
    """
    n_symbols    = len(barcode) + 2          # data chars + start + stop
    barcode_dots = n_symbols * 30 + (n_symbols - 1) * 2 + 40  # +40 quiet zones
    return max(0, right - barcode_dots)


ROW_FONT = 30          # EVERY text field prints at the price's font size (user directive,
                       # 2026-09-27 print feedback)
ROW_PITCH = 27         # row stride: 30pt caps ≈ 21 dots leave ~6 dots of air between rows
BAND_TOP = 14          # barcode top — the media top sits ≈12 dots below format y=0
                       # (ruler print 2026-09-27: the y=0 band prints off-media)
BARCODE_HEIGHT = 46
EVENT_ROW_Y = 33       # event row — the price's OLD top-band-left slot (2026-10-06:
                       # event shifts up into it; the barcode occupies 14..60 to
                       # its right). Supersedes the 2026-09-28 below-the-price
                       # placement, which only applied while the price sat there.
ID_ROW_Y = 93          # item-ID row, uniform on every label — centered under the
                       # bars (the bars occupy y 14..60; +6 dots of ink clearance)
SELLER_ROW_Y = 120     # seller row — the PRICE (+ the donate flag) join it in the
                       # right column (2026-10-06 v6 user directive: "the row with
                       # Y = 120"); all rows below unchanged from v5
TEXT_ROWS_Y = 80       # text-mode FLOW start: the seller row — the flag+price and
                       # the seller share it (below the 50pt code ink, ends ≈75)
MAX_FIELD_CHARS = 28   # 28 × (0.6 × 30) ≈ 504 dots ≤ content width
DESC_MAX_CHARS = 20    # description truncates at 20 chars (2026-10-06: directive,
                       # originally 30)
ROW_INK = 24           # worst-case ink depth of a 30pt row (caps + descenders)
LABEL_DOWN_DOTS = 4    # v7 (2026-10-06 user directive: "move the whole label down
                       # by 4 dots") — print-feedback media shift applied to
                       # every field's y via dy_eff


def generate_zpl(
    item,
    copies: int | None = None,
    code_as_text: bool = False,
    event_name: str | None = None,
    dx: int = 0,
    dy: int = 0,
) -> str:
    """Generate a ZPL II label string for the ZD421 (203 dpi).

    Layout (2026-10-06 v7 — every field sits 4 dots lower (LABEL_DOWN_DOTS,
    user directive); v6 = price-beside-flag-in-seller-row; v5 = event into
    the price's old band slot):
      - Top band: Code 128 barcode top-right — anchored to the
        ruler-measured media window (2026-09-27 fine probes, two prints
        agreeing post-recalibration: content x 147..723); the old
        280..850 window printed bars past the media edge; the barcode
        starts at y=14 because the ruler print showed the media top ≈12
        dots below format y=0
      - Event name: takes the price's OLD top-band-left slot (y=33) — the
        slot the price vacated when it moved below the barcode (2026-10-06
        user directive: "shift the event name to take the place of the
        price, and everything below shifted up"). Left column, uniform y,
        never truncated, omitted when not provided. This supersedes the
        2026-09-28 "always below the price / never in the band" placement,
        which only applied while the price sat in the band
      - Price + donation flag: one composed field in the RIGHT COLUMN of
        the seller row (2026-10-06 v6 user directive: "place the price in
        the right column in the row with Y = 120, left justified, with a
        few spaces separating the price and the Donate Flag") — left-
        justified: donated items print "D" + four spaces + the price,
        left-packed at the column edge ("D    $125.00"); non-donate items
        print the price alone at the same edge. In barcode mode the
        column edge is the barcode's x anchor (bx — the same right-column
        band the barcode and the centered ID occupy; floored so a very
        long item code can never slide the flag under the seller code);
        text mode (no barcode) splits the content width at its midpoint.
        Supersedes v4/v5's dedicated price row below the band (y=66 — now
        empty) and the v4 "D below the price" placement
      - Donation flag: rides beside the price in that composed field
        (v6); the flag left the item-ID row, which keeps its uniform row
        alone
      - EVERY text field prints at the price's font size (30pt): price,
        donation flag, event name, item identifier, seller code,
        category + size, description, free-text lines (user directive
        after the first live print of v2; kept in v4)
      - Item identifier: UNCHANGED — its own full 30pt row centered under
        the barcode, uniform y, clear of the bars (v2's 5-dot gap read as
        "mixed up with the barcode"); skipped in ``code_as_text`` mode,
        where the code already prints large in the band
      - Event name: see the top-band bullet above (2026-10-06: the
        price's old slot, above the price; consumes no lower row — the
        seller/category/description flow is identical with or without it)
      - Seller code, category + ``Sz:`` size, description and the optional
        ``label_line_2``/``label_line_3`` free-text lines follow, one 30pt
        row each, printed top-down while they still fit the 1" canvas
        (media confirmed ≈3" × 1" — ^LL back to 203; the v2 "compact
        regime" is gone). The description truncates to 20 characters
        (2026-10-06 directive, originally 30); the other fields keep the
        28-char cap
    Text fields use ``^FT`` (field top): for scalable fonts ``^FO`` positions
    at the BASELINE, which clipped the tops of the price/ID (print test
    2026-09-13).

    Copies: with no explicit ``copies`` an ``^PQ`` command emits one tag per
    on-hand remaining unit — the "N labels per N units" decision from tester
    feedback (2026-08-29), so mid-event reprints only cover units still in
    stock. With an explicit ``copies`` the ``^PQ`` emits exactly that many
    labels (the "print a specified number of labels per item" flow).

    ``code_as_text``: render the item code as text instead of a barcode
    (option added 2026-09-12). ``event_name``: printed in the top band's
    left slot — the price's old place, now above the price (2026-10-06;
    below the price 2026-09-28, beside the identifier originally
    2026-09-12; omitted when not provided).

    ``dx``/``dy``: optional geometry nudge in dots (203 dpi) applied to EVERY
    field coordinate — dx negative = left, dy positive = down. Baked into
    the coordinates because ``^FT``-positioned fields ignore ``^LS``/``^LT``
    label shifts (see module docstring), so an offset must move each x/y.
    Added for the client-side Browser-Print agent path (2026-09-30): the
    Windows workstation's agent-delivered labels print 3 dots right and
    3 dots high versus the server-attached printer, so agent mode requests
    dx=-3, dy=3. dx=dy=0 (the default) emits byte-identical output as
    before. ``^PW`` stays the media print width — only field positions move.
    With dy=dy_eff's LABEL_DOWN_DOTS global shift: dx=dy=0 emits the
    un-nudged layout (which since v7 already includes the +4-dot label
    shift)."""
    barcode      = item.barcode_39 or item.code
    seller_code  = item.seller.code if item.seller else ""
    description  = (item.description or "")[:DESC_MAX_CHARS]   # 20-char cap (2026-10-06)
    line2        = (item.label_line_2 or "")[:MAX_FIELD_CHARS]
    line3        = (item.label_line_3 or "")[:MAX_FIELD_CHARS]
    category     = str(item.category or "").upper()
    size         = str(item.size or "")
    cat_size     = "  ".join(
        part for part in (category, f"Sz: {size}" if size else "") if part
    )[:MAX_FIELD_CHARS]
    event_name   = (event_name or "")[:MAX_FIELD_CHARS]
    # dx/dy shift EVERY field x/y (dots). ^PW below stays anchored to the
    # unshifted media width — only field positions move (see docstring).
    # v7 (2026-10-06): the whole label sits LABEL_DOWN_DOTS dots lower —
    # folded into the effective dy every field shares, so the per-print
    # dx/dy nudge (Browser-Print agent path) stacks on top of it.
    origin       = LABEL_LEFT_ORIGIN_DOTS + dx
    right        = LABEL_RIGHT_EDGE_DOTS + dx
    dy_eff       = dy + LABEL_DOWN_DOTS
    band_top_y   = BAND_TOP + dy_eff      # barcode ^FO top
    text_code_y  = 40 + dy_eff            # code_as_text block top
    # Bars end AT the content right edge: _barcode_x reserves a 20-dot quiet
    # zone after the last bar, so pass right+20 and let the (blank) trailing
    # quiet zone fall past the edge — the printed bars end exactly at `right`
    # (user directive 2026-09-27: the bars end at the right content edge,
    # 723 after the fine-probe tune).
    bx           = _barcode_x(barcode, right + 20)
    price_text   = f"${item.price:.2f}"

    # Event name: takes the price's OLD top-band-left slot (2026-10-06 user
    # directive — "shift the event name to take the place of the price, and
    # everything below shifted up"; supersedes the 2026-09-28 below-the-
    # price placement, which only applied while the price sat there).
    # Left column, uniform y, never truncated; it consumes no row in the
    # lower flow — everything below shifts up exactly one pitch.
    event_y      = EVENT_ROW_Y + dy_eff
    event_block = ""
    if event_name:
        event_block = (
            f"^FT{origin},{event_y}^A0N,{ROW_FONT},{ROW_FONT}^FD{event_name}^FS\n"
        )

    # Identifier (barcode / large text) — top band, unchanged (barcode
    # mode: ^FO-anchored bars ending at the right edge; text mode: the
    # large code right-aligned via ^FB — no repeated identifier row).
    if code_as_text:
        code_block = f"^FT{origin},{text_code_y}^FB{right - origin},1,0,R,0^A0N,50,50^FD{item.code}^FS\n"
    else:
        code_block = f"^FO{bx},{band_top_y}^BCN,{BARCODE_HEIGHT},N,N,N^FD{barcode}^FS\n"

    # Price + donation flag: one composed field in the right column of the
    # seller row (2026-10-06 v6 user directive — "place the price in the
    # right column in the row with Y = 120, left justified, with a few
    # spaces separating the price and the Donate Flag"): donated items
    # print "D" + four spaces + the price, left-packed at the column edge;
    # non-donate items print the price alone at the same edge. Barcode
    # mode: the column edge is the barcode's x anchor (bx — the right-
    # column band the barcode and the centered ID occupy), floored so an
    # unusually long item code never slides the flag under the seller's
    # code (6-char cap + the flag prefix + spacing). Text mode (no
    # barcode): the content width's midpoint. The price leaves its v5 row
    # below the band (y=66 now empty) and the flag leaves the ID row.
    price_row_y  = (TEXT_ROWS_Y if code_as_text else SELLER_ROW_Y) + dy_eff
    price_col_x  = max(bx, origin + 10 * 18) if not code_as_text else (origin + right) // 2
    flag_price   = f"D    {price_text}" if item.donate_unsold else price_text
    price_block  = f"^FT{price_col_x},{price_row_y}^A0N,{ROW_FONT},{ROW_FONT}^FD{flag_price}^FS\n"

    # Item identifier row (barcode mode only): UNCHANGED uniform y —
    # centered under the bars. The donate flag left this row in v6 (it
    # rides beside the price now); the lower flow resumes below it.
    number_block = ""
    row_y        = (TEXT_ROWS_Y if code_as_text else SELLER_ROW_Y) + dy_eff
    if not code_as_text:
        number_block = (
            f"^FT{bx},{ID_ROW_Y + dy_eff}^FB{right - bx},1,0,C,0"
            f"^A0N,{ROW_FONT},{ROW_FONT}^FD{barcode}^FS\n"
        )

    # Lower block: one 30pt row per field, top to bottom; on the 1" canvas a
    # row that would run past the media edge is dropped rather than clipped.
    lower_blocks = ""
    for text in (seller_code, cat_size, description, line2, line3):
        if not text:
            continue
        if row_y + ROW_INK > LABEL_LENGTH_DOTS:
            break
        lower_blocks += f"^FT{origin},{row_y}^A0N,{ROW_FONT},{ROW_FONT}^FD{text}^FS\n"
        row_y += ROW_PITCH
    try:
        # On-hand remaining (== intake quantity until a partial sale) —
        # reprints mid-event print labels only for units still in stock.
        # An explicit `copies` overrides it ("print a specified number").
        quantity = int(getattr(item, "remaining", 1) or 1)
    except (TypeError, ValueError):
        quantity = 1
    if copies is not None:
        quantity = max(1, copies)
    pq = f"^PQ{max(1, quantity)}\n" if quantity > 1 else ""

    return (
        "^XA\n"
        f"^MD{max(0, min(30, LABEL_DARKNESS))}\n"
        f"^LL{LABEL_LENGTH_DOTS}\n"
        f"^PW{right}\n"
        "^CI0\n"
        f"{event_block}"
        f"{code_block}"
        f"{price_block}"
        f"{number_block}"
        f"{lower_blocks}"
        f"{pq}"
        "^XZ\n"
    )


def send_to_printer(zpl: str, printer_path: str = LABEL_PRINTER_PATH) -> None:
    """Send ZPL to the printer.

    On macOS: writes directly to the Zebra USB endpoint via pyusb.
    On Linux: writes raw bytes to the device path (e.g. /dev/usb/lp0); when
    the device is unavailable (this deployment's ZD421 is owned by the CUPS
    queue ``ZTC-ZD421-203dpi-ZPL`` — no raw /dev node), falls back to the
    CUPS queue via ``lp -o raw``, which passes ZPL through byte-for-byte.
    """
    if sys.platform == "darwin":
        _send_usb(zpl)
    else:
        # pyusb is an optional dependency (macOS-only path); the Linux device
        # write below is the primary path on this deployment.
        try:
            with open(printer_path, "wb") as f:
                f.write(zpl.encode("utf-8"))
            return
        except OSError as exc:
            # Device missing/unavailable — fall through to the CUPS queue.
            logging.getLogger(__name__).debug(
                "Label device '%s' unavailable (%s) — sending via CUPS queue '%s'",
                printer_path,
                exc,
                LABEL_PRINTER_QUEUE,
            )
        try:
            proc = subprocess.run(
                ["lp", "-d", LABEL_PRINTER_QUEUE, "-o", "raw"],
                input=zpl.encode("utf-8"),
                capture_output=True,
                timeout=30,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise OSError(
                f"Label printer unavailable: device '{printer_path}' not writable "
                f"and CUPS queue '{LABEL_PRINTER_QUEUE}' failed ({exc})"
            ) from exc
        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout).decode(errors="replace").strip()
            raise OSError(f"CUPS print to '{LABEL_PRINTER_QUEUE}' failed: {detail}")


def _send_usb(zpl: str) -> None:
    """Write ZPL directly to the Zebra USB bulk-OUT endpoint (macOS)."""
    import usb.core  # pyright: ignore[reportMissingImports]  (optional macOS-only dep)
    import usb.util  # pyright: ignore[reportMissingImports]

    dev = usb.core.find(idVendor=_ZEBRA_VID, idProduct=_ZEBRA_PID)
    if dev is None:
        raise OSError("Zebra printer not found on USB")

    if dev.is_kernel_driver_active(0):
        dev.detach_kernel_driver(0)

    dev.set_configuration()
    intf = dev.get_active_configuration()[(0, 0)]

    ep_out = usb.util.find_descriptor(
        intf,
        custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress)
        == usb.util.ENDPOINT_OUT,
    )
    if ep_out is None:
        raise OSError("No USB OUT endpoint found on Zebra printer")

    ep_out.write(zpl.encode("utf-8"))
