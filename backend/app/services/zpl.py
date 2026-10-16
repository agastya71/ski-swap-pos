"""ZPL label generation and printing service.

Generates ZPL II label strings for the Zebra ZD421 (203 dpi) and sends them
via direct USB (pyusb) or a Linux device path, with a CUPS `lp` fallback —
the live deployment's ZD421 is owned by the CUPS queue ``ZTC-ZD421-203dpi-ZPL``
(no raw ``/dev/usb/lp*`` node exists).

LABEL TEMPLATES (v11, 2026-10-14 user request) — the layout lives OUTSIDE the
code, in ``backend/templates/label_item.zpl`` (barcode mode) and
``label_item_text.zpl`` (``code_as_text`` mode). Both files are re-read from
disk on every print, so layout edits go live with NO recompile and NO service
restart. ``; @name value`` directive lines override the renderer's geometry
constants (a directive beats the same-named env/config default); the body is
plain ZPL with ``{{placeholders}}`` filled per item and ``{{#key}}…{{/key}}`` /
``{{^key}}…{{/key}}`` include/exclude blocks; unknown names, unbalanced blocks
or a missing file FAIL the print loudly. The per-item values (exact Code 128
bar width/model, per-row flow y's with the fit guard, char caps, truncation)
are still computed HERE — see ``generate_zpl`` and the template headers.
Layout-decision history (v2…v10) lives in git history and ``.wolf/cerebrum.md``.

Text fields use ``^FT`` (field top), and ``^LS`` is NOT used: ^FT-positioned
fields ignore the label shift, so positions are baked into each field instead.
"""

import logging
import os
import re
import subprocess
import sys
from pathlib import Path

from app.config import (
    LABEL_DARKNESS,
    LABEL_LENGTH_DOTS,
    LABEL_LEFT_ORIGIN_DOTS,
    LABEL_PRINTER_PATH,
    LABEL_PRINTER_QUEUE,
    LABEL_RIGHT_EDGE_DOTS,
)

_ZEBRA_VID   = 0x0A5F
_ZEBRA_PID   = 0x0185


def _code128_symbols(data: str) -> int:
    """Symbol-character count of ZPL ^BC's automatic Code 128 encodation.

    Every Code 128 character carries 11 modules (start, data, a MANDATORY
    mod-103 check, stop — the characters chain with NO inter-character gaps).
    Numeric data packs digit PAIRS into subset C (2 digits per symbol char);
    an odd trailing digit costs 2 extra symbols (the subset-B switch + the
    digit). Mixed alphanumeric data encodes subset B — ZPL's auto subsetting
    may differ from this simple model by ±1 symbol there, which only shifts
    the bars' LEFT edge ±22 dots (the right edge stays anchored; see
    _barcode_x).
    """
    if data.isdigit():
        pairs, odd = divmod(len(data), 2)
        return 1 + pairs + (2 if odd else 0) + 1 + 1
    return 1 + len(data) + 1 + 1


def _barcode_x(barcode: str, right: int) -> int:
    """Return the x origin (dots) that RIGHT-aligns the barcode so the BARS
    end EXACTLY at ``right − 20`` — the field's 20-dot trailing quiet zone
    then falls just past the content right edge (v7's convention, now with
    an EXACT model: v7's conservative 30-dots/symbol estimate parked the
    bars ≈100 dots short of the right edge on 5-digit numeric codes and
    dragged the price/ID column left with them — exactly the dead space the
    2026-10-12 user directive wants used; bars now run to the edge and the
    right column packs tight beneath them).

    Expects the ^BY default module width of 2 dots (Code 128 = uniform
    11-module characters; quiet zones = 10× module = 20 dots per side).
    """
    ink   = _code128_symbols(barcode) * 11 * 2    # module width 2
    field = 20 + ink + 20                         # leading + trailing quiet zones
    return max(0, right - field)


# ── Renderer-side constants ──────────────────────────────────────────────────
# Only defaults for the template directives; the template's `; @name value`
# lines override any of them per render (see _LABEL_DIRECTIVES / templates).
_PLAIN_H = 28           # plain-text rows: bitmap font E (OCR-B) native 28×15
_PLAIN_W = 15           # (^AEN,28,15) — plain weight, CRISP at ×1 (v8): font 0
                        # is CG Triumvirate BOLD Condensed, the ZD421's only
                        # resident scalable font, which made rows read bold
_PLAIN = "^AEN,28,15"   # the exact font command the row builder emits

_PLAIN_FONT = _PLAIN    # alias used by template values (rows are renderer-built)

EVENT_ROW_Y = 33       # event row — the price's OLD top-band-left slot (v5,
                       # 2026-10-06): event shifts up into it; the barcode
                       # occupies 14..60 to its right
ID_ROW_Y = 86          # item-ID row, uniform on every label — centered under
                       # the bars (bars occupy y 14..60; v9 2026-10-12: MORE
                       # vertical air between the ID row and the price)
SELLER_ROW_Y = 120     # seller row — the PRICE (+ donate flag) ride its right
                       # column (v6, 2026-10-06: "the row with Y = 120")
TEXT_ROWS_Y = 80       # text-mode FLOW start (below the 50pt code ink, ≈75)
TEXT_CODE_Y_BASE = 34  # text-mode band-code top (v8: rides 6 dots higher —
                       # the ×2 bitmap cell needs the ink clearance)
MAX_FIELD_CHARS = 28   # 28 × (0.6 × 30) ≈ 504 dots ≤ content width
DESC_MAX_CHARS = 20    # description truncates at 20 chars (2026-10-06 directive)
ROW_INK = 24           # worst-case ink depth of a 30pt row (fit guard)
ROW_PITCH = 27         # row stride: 30pt caps ≈ 21 dots leave ~6 dots of air
BAND_TOP = 14          # barcode top — media top sits ≈12 dots below format y=0
BARCODE_HEIGHT = 46
BIG_CODE_H = 56        # text-mode band code: font E ×2 (56×30 integer cell)
BIG_CODE_W = 30
BOLD_D_FONT = 30       # donation flag "D": font 0 (bold) at 30 dots, v2–v7 style
FLAG_D_WIDTH = 14      # bold "D" advance in font 0 at 30 dots (render-tuned)
FLAG_GAP = 26          # ≈ the 4 font-0 spaces the v6 composed field used
LABEL_DOWN_DOTS = 4    # v7 (2026-10-06 user: "move the whole label down by 4
                       # dots") — print-feedback media shift
LABEL_LEFT_DOTS = -20  # v10 (2026-10-14 user: "the whole label needs to be
                       # shifted 20 dots to the left") — print-feedback shift
PRICE_COL_FLOOR_OFFSET = 10 * 18   # barcode mode: the flag/price column edge
                                   # is floored at origin + this, so an
                                   # unusually long item code can never slide
                                   # the flag under the seller's code


# ── Label template engine (v11) ──────────────────────────────────────────────
_TEMPLATES_DIR = Path(__file__).resolve().parents[2] / "templates"   # backend/templates
TEMPLATE_ENV_VAR = "LABEL_TEMPLATE_DIR"   # per-call override of the template dir

_LABEL_DIRECTIVES = {
    # name -> renderer-side default. Values are the FINAL format coordinates
    # (the v7 "+4 down" / v10 "−20 left" whole-label print-feedback shifts are
    # already folded into these shipped numbers) — a template `; @name value`
    # sets the number that is actually emitted; nothing stacks behind it.
    "left_origin":       LABEL_LEFT_ORIGIN_DOTS + LABEL_LEFT_DOTS,   # 147 −20 = 127
    "right_edge":        LABEL_RIGHT_EDGE_DOTS + LABEL_LEFT_DOTS,   # 723 −20 = 703
    "y_event":           EVENT_ROW_Y + LABEL_DOWN_DOTS,             # 33 +4 = 37
    "y_band_top":        BAND_TOP + LABEL_DOWN_DOTS,                # 14 +4 = 18
    "y_id":              ID_ROW_Y + LABEL_DOWN_DOTS,                # 86 +4 = 90
    "y_price_barcode":   SELLER_ROW_Y + LABEL_DOWN_DOTS,            # 120 +4 = 124
    "y_price_text":      TEXT_ROWS_Y + LABEL_DOWN_DOTS,             # 80 +4 = 84
    "y_text_code":       TEXT_CODE_Y_BASE + LABEL_DOWN_DOTS,        # 34 +4 = 38
    "row_pitch":         ROW_PITCH,
    "row_ink":           ROW_INK,
    "barcode_height":    BARCODE_HEIGHT,
    "label_length":      LABEL_LENGTH_DOTS,
    "darkness":          LABEL_DARKNESS,
    "desc_max_chars":    DESC_MAX_CHARS,
    "max_field_chars":   MAX_FIELD_CHARS,
    "flag_d_width":      FLAG_D_WIDTH,
    "flag_gap":          FLAG_GAP,
    "bold_d_font":       BOLD_D_FONT,
    "big_code_h":        BIG_CODE_H,
    "big_code_w":        BIG_CODE_W,
    "bars_right_nudge":  10,  # v9.3 BARCODE_RIGHT_NUDGE
}

_DIRECTIVE_RX = re.compile(r"^;\s*@([A-Za-z_][A-Za-z0-9_]*)\s+(-?\d+)\s*(?:;.*)?$")
_SECTION_RX   = re.compile(r"\{\{([#\^])([A-Za-z_][A-Za-z0-9_]*)\}\}(.*?)\{\{/\2\}\}", re.S)
_VAR_RX       = re.compile(r"\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}")
_FIELD_XY_RX  = re.compile(r"(\^(?:FO|FT))(-?\d+),(-?\d+)")
_PW_RX        = re.compile(r"(\^PW)(\d+)")


def label_template_path(code_as_text: bool) -> Path:
    """Path of the label template file for the given mode (re-read per render)."""
    name = "label_item_text.zpl" if code_as_text else "label_item.zpl"
    override = os.getenv(TEMPLATE_ENV_VAR, "")
    return (Path(override) if override else _TEMPLATES_DIR) / name


def _load_label_template(code_as_text: bool) -> tuple[str, dict[str, int]]:
    """Read the template file — ON EVERY CALL, so file edits are live without
    recompiling or restarting the service (2026-10-14 user request).

    Returns (template_text, geometry) where geometry is the directive table
    with the template's `; @name value` lines overriding the defaults. A
    missing file, an unknown directive name, or a non-int value raises
    (the print fails loudly — fix the file and print again).
    """
    path = label_template_path(code_as_text)
    text = path.read_text(encoding="utf-8")
    overrides: dict[str, int] = {}
    for line in text.splitlines():
        m = _DIRECTIVE_RX.match(line.strip())
        if m:
            overrides[m.group(1)] = int(m.group(2))
    unknown = sorted(set(overrides) - set(_LABEL_DIRECTIVES))
    if unknown:
        raise ValueError(
            f"label template {path.name}: unknown directives {unknown} "
            f"(valid: {sorted(_LABEL_DIRECTIVES)})"
        )
    return text, {**_LABEL_DIRECTIVES, **overrides}


def _render_template(text: str, values: dict) -> str:
    """Fill the template: strip `;` comment lines FIRST (so header docs may
    show literal `{{…}}` syntax), then include/exclude blocks, then variables,
    then drop the lines left empty by suppressed blocks."""
    text = "\n".join(
        ln for ln in text.split("\n") if not ln.lstrip().startswith(";")
    )

    def _section(m: re.Match) -> str:
        op, key, body = m.group(1), m.group(2), m.group(3)
        if key not in values:
            raise ValueError(
                f"label template references block {key!r} that the renderer does not provide"
            )
        truthy = bool(values[key])
        return body if (truthy if op == "#" else not truthy) else ""

    text = _SECTION_RX.sub(_section, text)
    if _SECTION_RX.search(text) is not None:
        raise ValueError(
            "label template has nested or unbalanced {{#…}}/{{^…}} blocks "
            "(single level only)"
        )

    def _var(m: re.Match) -> str:
        key = m.group(1)
        if key not in values:
            raise ValueError(
                f"label template references variable {key!r} that the renderer does not provide"
            )
        return str(values[key])

    text = _VAR_RX.sub(_var, text)
    lines = [ln for ln in text.split("\n") if ln.strip()]
    return "\n".join(lines) + "\n"


def _nudge_coordinates(zpl: str, dx: int, dy: int) -> str:
    """Shift EVERY rendered field coordinate: x + dx, y + dy, ^PW + dx.

    The per-print nudge (Browser-Print agent path, 2026-09-30: agent-delivered
    labels print 3 dots right and 3 dots high vs the server-attached printer)
    is applied to the RENDERED ZPL — the template's static numbers hold the
    base geometry (which already carries the v7/v10 print-feedback shifts).
    The media's measured window ends far inside the tag edge, so the ±3 (or
    any sane) nudge stays on-media.
    """
    if not (dx or dy):
        return zpl
    zpl = _FIELD_XY_RX.sub(
        lambda m: f"{m.group(1)}{int(m.group(2)) + dx},{int(m.group(3)) + dy}", zpl
    )
    zpl = _PW_RX.sub(lambda m: f"{m.group(1)}{int(m.group(2)) + dx}", zpl)
    return zpl


def generate_zpl(
    item,
    copies: int | None = None,
    code_as_text: bool = False,
    event_name: str | None = None,
    dx: int = 0,
    dy: int = 0,
) -> str:
    """Generate a ZPL II label string for the ZD421 (203 dpi) from the
    TEMPLATE FILE for the mode (``label_item.zpl`` / ``label_item_text.zpl``
    — re-read on every print; edits are live with no recompile/restart).

    What the renderer computes per item (see the template headers):
      - ``{{code}}`` — the item id ONLY (v8, 2026-10-12: never the
        customizable ``barcode_39`` string). With the numeric 5-digit item
        codes (2026-09-18) ^BC's automatic subset selection packs digit pairs
        (subset C, ≈22 dots/symbol pair — the densest linear symbology in
        ZPL). Legacy databases with alphanumeric codes keep printing subset-B
        Code 128 as before; Code 39/Codabar would print WIDER, I2of5 pads
        odd digit counts, 2D codes need a 2D scanner.
      - ``{{barcode_x}}``/``{{text_fb_w}}`` — the exact Code 128 model
        (11 modules/char × module 2 + 20-dot quiet zones per side) right-
        aligns the bars so their INK ends at ``right_edge − bars_right_nudge``;
        the ID row centers on that band; the flag/price column edge anchors
        at the bars' start, floored at ``origin + 180`` so a very long code
        never slides the flag under the seller code.
      - ``{{rows}}`` — the lower flow (seller code, category + ``Sz:`` size,
        description, then the optional ``label_line_2``/``label_line_3``),
        one 27-dot-pitch row per present field, top-down, with truncation
        (description to 20 chars, others 28) and the 1" fit guard: a row that
        would run past ``label_length`` is dropped rather than clipped.
      - ``{{copies}}`` — with no explicit ``copies``, an ``^PQ`` emits one tag
        per on-hand remaining unit (the "N labels per N units" decision,
        2026-08-29: mid-event reprints cover units still in stock); an
        explicit ``copies`` emits exactly that many; quantity 1 emits no ^PQ.
      - ``{{event}}`` — printed in the price's old top-band slot (v5, uniform
        y, never truncated, omitted when not provided; consumes no flow row).
      - ``{{price}}``/donate flag — the flag is its OWN bold field (font 0),
        the plain OCR-B price starts ``flag_d_width + flag_gap`` right of the
        flag's left edge (v8: "plain script except for the Donation flag (D)").

    ``dx``/``dy`` — per-print nudge in dots applied AFTER rendering (x + dx,
    y + dy, ^PW + dx); the agent path requests dx=-3, dy=3. ``^LS``/``^LT``
    are not used because ``^FT``-positioned fields ignore them (module
    docstring).
    """
    template_text, geom = _load_label_template(code_as_text)

    # Directive values ARE the final format coordinates — the v7 (+4 down)
    # and v10 (−20 left) whole-label print-feedback shifts are already inside
    # the shipped numbers, so a template edit sets the tag's truth directly.
    # Per-print dx/dy nudge after rendering stacks on top.
    origin = geom["left_origin"]
    right  = geom["right_edge"]

    barcode      = item.code
    seller_code  = item.seller.code if item.seller else ""
    description  = (item.description or "")[: geom["desc_max_chars"]]
    line2        = (item.label_line_2 or "")[: geom["max_field_chars"]]
    line3        = (item.label_line_3 or "")[: geom["max_field_chars"]]
    category     = str(item.category or "").upper()
    size         = str(item.size or "")
    cat_size     = "  ".join(
        part for part in (category, f"Sz: {size}" if size else "") if part
    )[: geom["max_field_chars"]]
    event_name   = (event_name or "")[: geom["max_field_chars"]]
    price_text   = f"${item.price:.2f}"

    values: dict = {
        "darkness":     max(0, min(30, geom["darkness"])),
        "label_length": geom["label_length"],
        "pw":           right,
        "origin":       origin,
        "y_event":      geom["y_event"],
        "event":        event_name,          # falsy → block suppressed
        "donate":       bool(item.donate_unsold),
        "bold_d_font":  geom["bold_d_font"],
        "big_code_h":   geom["big_code_h"],
        "big_code_w":   geom["big_code_w"],
        "code":         barcode,
        "price":        price_text,
    }

    # Barcode mode: bars + centered ID row + the column underneath them.
    # Text mode: the code as big text (font E ×2) right-aligned in the band,
    # no identifier row, and the flag/price column at the width's midpoint.
    bx = _barcode_x(barcode, right + 20 - geom["bars_right_nudge"])
    band_right = right - geom["bars_right_nudge"]
    if code_as_text:
        price_col_x = (origin + right) // 2
        values["text_fb_w"]    = right - origin
        values["y_text_code"]  = geom["y_text_code"]
    else:
        price_col_x = max(bx, origin + PRICE_COL_FLOOR_OFFSET)
        values["barcode_x"]     = bx
        values["barcode_height"] = geom["barcode_height"]
        values["y_band_top"]    = geom["y_band_top"]
        values["y_id"]          = geom["y_id"]
        values["id_block_w"]    = band_right - bx
    values["price_col_x"] = price_col_x
    values["y_price"]     = (
        geom["y_price_text"] if code_as_text else geom["y_price_barcode"]
    )
    values["price_x"] = price_col_x + (
        geom["flag_d_width"] + geom["flag_gap"] if item.donate_unsold else 0
    )

    # Lower flow: one row per present field, top-down, dropped when the 1"
    # canvas can't take its ink (rows take no pitch when absent — the flow
    # rides up, exactly as v5+).
    row_lines: list[str] = []
    row_y = values["y_price"]
    for text in (seller_code, cat_size, description, line2, line3):
        if not text:
            continue
        if row_y + geom["row_ink"] > geom["label_length"]:
            break
        row_lines.append(f"^FT{origin},{row_y}{_PLAIN}^FD{text}^FS")
        row_y += geom["row_pitch"]
    values["rows"] = "\n".join(row_lines)

    try:
        # On-hand remaining (== intake quantity until a partial sale) —
        # reprints mid-event print labels only for units still in stock.
        # An explicit `copies` overrides it ("print a specified number").
        quantity = int(getattr(item, "remaining", 1) or 1)
    except (TypeError, ValueError):
        quantity = 1
    if copies is not None:
        quantity = max(1, copies)
    values["copies"] = f"{quantity}" if quantity > 1 else ""

    return _nudge_coordinates(_render_template(template_text, values), dx, dy)


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