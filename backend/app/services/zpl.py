"""ZPL label generation and printing service.

Generates ZPL II label strings for the Zebra ZD421 (203 dpi) and sends them
via direct USB (pyusb) or a Linux device path, with a CUPS `lp` fallback —
the live deployment's ZD421 is owned by the CUPS queue ``ZTC-ZD421-203dpi-ZPL``
(no raw ``/dev/usb/lp*`` node exists).

Label geometry is measured and explicit (2026-09-13 calibration; media size
confirmed by the user 2026-09-27: ≈3" wide × 1" tall): the media window in
``^FT`` coordinates spans ``LABEL_LEFT_ORIGIN_DOTS`` (≈ 280) to
``LABEL_RIGHT_EDGE_DOTS`` (≈ 810) — the media start position under the
printhead moved print-to-print until gap-tracking mode (^MNY) + media
calibration (~JC) were applied. Text fields use ``^FT`` (field top), and
``^LS`` is NOT used: ^FT-positioned fields ignore the label shift, so the
left origin is baked into every x coordinate instead.
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


_CHAR_W = 0.6          # A0N scalable average glyph width ≈ fraction of font height
ROW_FONT = 30          # EVERY text field prints at the price's font size (user directive,
                       # 2026-09-27 print feedback)
ROW_PITCH = 29         # row stride: 30pt caps ≈ 21 dots leave ~8 dots of air between rows
BAND_TEXT_Y = 25       # price / in-band event field top (barcode occupies 5..53)
BARCODE_HEIGHT = 48
FIRST_ROW_Y = 62       # first full-width row below the barcode band (+9 clear of the bars)
TEXT_ROWS_Y = 80       # text-mode rows start below the 50pt code ink (ends ≈75)
MAX_FIELD_CHARS = 28   # 28 × (0.6 × 30) ≈ 504 dots ≤ content width (~530)
ROW_INK = 24           # worst-case ink depth of a 30pt row (caps + descenders)


def generate_zpl(
    item,
    copies: int | None = None,
    code_as_text: bool = False,
    event_name: str | None = None,
) -> str:
    """Generate a ZPL II label string for the ZD421 (203 dpi).

    Layout (2026-09-27 v3 — print-feedback revision of the MYSL 2020 photo
    layout; supersedes the v2 font ladder):
      - EVERY text field prints at the price's font size (30pt): price,
        event name, item identifier, seller code, category + size,
        description, free-text lines (user directive after the first live
        print of v2)
      - Top band: price top-left, Code 128 barcode top-right — pulled 40
        dots in from the media's right edge (the first print clipped bars
        past the ~830-dot media edge), event name right-aligned against
        the barcode when it fits the price→barcode zone at 30pt
      - The event name is NEVER truncated: when the band cannot hold it at
        30pt, it prints full-size, centered, on its own row below the band
        (user directive)
      - Item identifier on its own full 30pt row, centered under the
        barcode, a full row clear of the bars (v2's 5-dot gap read as
        "mixed up with the barcode"); skipped in ``code_as_text`` mode,
        where the code already prints large in the band
      - Seller code, category + ``Sz:`` size, description and the optional
        ``label_line_2``/``label_line_3`` free-text lines follow, one 30pt
        row each, printed top-down while they still fit the 1" canvas
        (media confirmed ≈3" × 1" — ^LL back to 203; the v2 "compact
        regime" is gone)
    Text fields use ``^FT`` (field top): for scalable fonts ``^FO`` positions
    at the BASELINE, which clipped the tops of the price/ID (print test
    2026-09-13).

    Copies: with no explicit ``copies`` an ``^PQ`` command emits one tag per
    on-hand remaining unit — the "N labels per N units" decision from tester
    feedback (2026-08-29), so mid-event reprints only cover units still in
    stock. With an explicit ``copies`` the ``^PQ`` emits exactly that many
    labels (the "print a specified number of labels per item" flow).

    ``code_as_text``: render the item code as text instead of a barcode
    (option added 2026-09-12). ``event_name``: printed between the price and
    the identifier (added 2026-09-12; omitted when not provided).
    """
    barcode      = item.barcode_39 or item.code
    seller_code  = item.seller.code if item.seller else ""
    description  = (item.description or "")[:MAX_FIELD_CHARS]
    line2        = (item.label_line_2 or "")[:MAX_FIELD_CHARS]
    line3        = (item.label_line_3 or "")[:MAX_FIELD_CHARS]
    category     = str(item.category or "").upper()
    size         = str(item.size or "")
    cat_size     = "  ".join(
        part for part in (category, f"Sz: {size}" if size else "") if part
    )[:MAX_FIELD_CHARS]
    event_name   = (event_name or "")[:MAX_FIELD_CHARS]
    origin       = LABEL_LEFT_ORIGIN_DOTS
    right        = LABEL_RIGHT_EDGE_DOTS
    bx           = _barcode_x(barcode, right)  # right-flush identifier origin
    price_text   = f"${item.price:.2f}"

    # Top band: price top-left, identifier (barcode / large text) top-right.
    if code_as_text:
        # The code is already printed large — no repeated identifier row.
        code_block = f"^FT{origin},40^FB{right - origin},1,0,R,0^A0N,50,50^FD{item.code}^FS\n"
        event_anchor = right - int(_CHAR_W * 50 * len(item.code)) - 20
    else:
        code_block = f"^FO{bx},5^BCN,{BARCODE_HEIGHT},N,N,N^FD{barcode}^FS\n"
        event_anchor = bx - 20
    # Event name at the price's font size, never truncated: right-aligned
    # against the identifier when the price→identifier zone holds it at
    # 30pt, otherwise centered on its own full-size row below the band.
    row_y = TEXT_ROWS_Y if code_as_text else FIRST_ROW_Y
    event_block = ""
    if event_name:
        zone_left = origin + int(_CHAR_W * ROW_FONT * len(price_text)) + 10
        if int(_CHAR_W * ROW_FONT * len(event_name)) <= event_anchor - zone_left:
            event_block = (
                f"^FT{origin},{BAND_TEXT_Y}^FB{event_anchor - origin},1,0,R,0"
                f"^A0N,{ROW_FONT},{ROW_FONT}^FD{event_name}^FS\n"
            )
        else:
            event_block = (
                f"^FT{origin},{row_y}^FB{right - origin},1,0,C,0"
                f"^A0N,{ROW_FONT},{ROW_FONT}^FD{event_name}^FS\n"
            )
            row_y += ROW_PITCH
    # Item identifier: its own full 30pt row, centered under the barcode, a
    # full row clear of the bars (v2's 5-dot gap read as "mixed up").
    number_block = ""
    if not code_as_text:
        number_block = (
            f"^FT{bx},{row_y}^FB{right - bx},1,0,C,0"
            f"^A0N,{ROW_FONT},{ROW_FONT}^FD{barcode}^FS\n"
        )
        row_y += ROW_PITCH
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
        f"^FT{origin},25^A0N,30,30^FD{price_text}^FS\n"
        f"{code_block}"
        f"{number_block}"
        f"{event_block}"
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
