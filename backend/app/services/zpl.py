"""ZPL label generation and printing service.

Generates ZPL II label strings for the Zebra ZD421 (203 dpi) and sends them
via direct USB (pyusb) or a Linux device path, with a CUPS `lp` fallback —
the live deployment's ZD421 is owned by the CUPS queue ``ZTC-ZD421-203dpi-ZPL``
(no raw ``/dev/usb/lp*`` node exists).

Label geometry is measured and explicit (2026-09-13 calibration): the media
window in ``^FT`` coordinates spans ``LABEL_LEFT_ORIGIN_DOTS`` (≈ 280) to
``LABEL_RIGHT_EDGE_DOTS`` (≈ 820) — the media start position under the
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
_EVENT_FONT_LADDER = (30, 26, 22, 18, 15)


def _fit_font(text: str, budget: int) -> tuple[int, str]:
    """Return the largest ladder font whose estimated width fits ``budget``
    (dots); when even the smallest size does not fit, the text is truncated
    at that size so the field can never run into its neighbour."""
    for height in _EVENT_FONT_LADDER:
        if int(_CHAR_W * height * len(text)) <= budget:
            return height, text
    smallest = _EVENT_FONT_LADDER[-1]
    max_chars = max(1, int(budget / (_CHAR_W * smallest)))
    return smallest, text[:max_chars]


def generate_zpl(
    item,
    copies: int | None = None,
    code_as_text: bool = False,
    event_name: str | None = None,
) -> str:
    """Generate a ZPL II label string for the ZD421 (203 dpi).

    Layout (2026-09-27, matched to the MYSL 2020 reference screenshot —
    ``Screenshot 2026-09-17 at 7.42.22 PM.png``; supersedes the 2026-09-13
    IMG_6581.jpg arrangement):
      - Top band: price top-left, event name right-aligned against the
        barcode (auto-shrinking font so long names never collide with the
        price or the barcode), item identifier top-right — Code 128 barcode
        (default) or the item code as large right-aligned text when
        ``code_as_text`` is set
      - Item identifier repeated LARGE, centered under the barcode (the
        photo's "3746" row; skipped in ``code_as_text`` mode, where the code
        is already printed large)
      - Seller code, category + ``Sz:`` size, and description left-justified
        below; the two optional free-text lines (``label_line_2``/
        ``label_line_3``) print in a compact regime beneath them so every
        row still fits the 1" canvas
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
    description  = (item.description or "")[:36]
    line2        = item.label_line_2 or ""
    line3        = item.label_line_3 or ""
    category     = str(item.category or "").upper()
    size         = str(item.size or "")
    cat_size     = "  ".join(
        part for part in (category, f"Sz: {size}" if size else "") if part
    )
    origin       = LABEL_LEFT_ORIGIN_DOTS
    right        = LABEL_RIGHT_EDGE_DOTS
    content_w    = right - origin
    bx           = _barcode_x(barcode, right)  # right-flush identifier origin
    price_text   = f"${item.price:.2f}"

    # Top band: price top-left, identifier (barcode / large text) top-right.
    if code_as_text:
        # The code is already printed large — no repeated identifier row.
        code_block = f"^FT{origin},40^FB{content_w},1,0,R,0^A0N,50,50^FD{item.code}^FS\n"
        number_block = ""
        event_anchor = right - int(_CHAR_W * 50 * len(item.code)) - 20
    else:
        code_block = f"^FO{bx},5^BCN,70,N,N,N^FD{barcode}^FS\n"
        number_block = (
            f"^FT{bx},80^FB{right - bx},1,0,C,0^A0N,32,32^FD{barcode}^FS\n"
        )
        event_anchor = bx - 20
    # Event name: inside the top band, right-aligned against the identifier
    # (the reference photo places it between the price and the barcode).
    # A font ladder keeps long names clear of the price and the barcode.
    event_block = ""
    if event_name:
        zone_left = origin + int(_CHAR_W * 30 * len(price_text)) + 10
        budget = event_anchor - zone_left
        if budget >= 40:
            height, text = _fit_font(event_name, budget)
            event_block = (
                f"^FT{origin},38^FB{event_anchor - origin},1,0,R,0"
                f"^A0N,{height},{height}^FD{text}^FS\n"
            )
    # Lower block: seller code, category + size, description — and, when the
    # optional free-text lines carry data, a compact regime that squeezes
    # every row onto the 203-dot canvas.
    compact     = bool(line2 or line3)
    num_h, num_y = (26, 78) if compact else (32, 80)
    number_block = (
        number_block.replace(f"^FT{bx},80^FB{right - bx},1,0,C,0^A0N,32,32",
                             f"^FT{bx},{num_y}^FB{right - bx},1,0,C,0^A0N,{num_h},{num_h}")
        if number_block else ""
    )
    row_gap     = 3 if compact else 4
    rows: list[tuple[str, int]] = [
        (seller_code, 22 if compact else 24),
        (cat_size,    18 if compact else 22),
        (description, 18 if compact else 22),
    ]
    if line2:
        rows.append((line2, 13))
    if line3:
        rows.append((line3, 13))
    lower_blocks = ""
    y = 108 if compact else 116
    for text, height in rows:
        if not text:
            continue
        lower_blocks += f"^FT{origin},{y}^A0N,{height},{height}^FD{text}^FS\n"
        y += height + (1 if height < 18 else row_gap)
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
        f"^FT{origin},38^A0N,30,30^FD{price_text}^FS\n"
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
