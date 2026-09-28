#!/usr/bin/env python3
"""Print a calibration ruler on the label printer (Zebra ZD421, 203 dpi).

Media is ≈3" wide × 1" tall (≈610 × 203 dots), but the media's position under
the printhead is what must be measured: this label prints two numbered scales
at known ZPL coordinates and the physical edges are read off directly —

  HORIZONTAL scale  ticks every 20 dots (x = 0..860), a number label every
                    100 dots (0, 100, … 800), tick band y = 130..148
  VERTICAL scale    full-width lines every 25 dots (y = 0..200), a number
                    label every 50 dots (0, 50, … 200) in two columns
                    (x = 330 and x = 650) so at least one column survives
                    even if the media sits far from the assumed window

Report the SMALLEST and LARGEST number that is fully visible on each scale:
the media edge lies between the last missing number and the first printed
one. The result sets LABEL_LEFT_ORIGIN_DOTS / LABEL_RIGHT_EDGE_DOTS (and
sanity-checks LABEL_LENGTH_DOTS) in backend/app/config.py — see runbook § 7.

Usage:
  cd backend && .venv/bin/python scripts/label_ruler.py [--copies N] [--dry-run]

``--dry-run`` writes the ZPL to stdout instead of the printer.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import LABEL_DARKNESS, LABEL_LENGTH_DOTS  # noqa: E402
from app.services.zpl import send_to_printer  # noqa: E402

# Print wider than the media on purpose: ticks past the media edge simply
# don't print, which is exactly the signal being measured.
RULER_PW = 850
TICK_STEP = 20
TICK_LABEL_STEP = 100
VLINE_STEP = 25
VLINE_LABEL_STEP = 50
VLINE_LABEL_COLUMNS = (330, 650)
TICK_Y, TICK_H = 130, 18  # tick band sits between the y=125 and y=150 lines
HLABEL_Y = 156  # between the y=150 and y=175 lines


def build_ruler_zpl(pw: int = RULER_PW, ll: int = LABEL_LENGTH_DOTS) -> str:
    """Build the ZPL for the calibration-ruler label."""
    parts = [
        "^XA",
        f"^MD{max(0, min(30, LABEL_DARKNESS))}",
        f"^LL{ll}",
        f"^PW{pw}",
        "^CI0",
        # Header sits inside the top band (between the y=0 and y=25 lines).
        "^FT280,4^FB530,1,0,C,0^A0N,16,16^FDCALIBRATION RULER^FS",
    ]
    # Vertical scale: full-width lines every 25 dots, labeled every 50 in two
    # x columns. The y=200 label moves ABOVE its line (there is no room
    # below on a 203-dot media).
    for y in range(0, ll + 1, VLINE_STEP):
        parts.append(f"^FO0,{y}^GB{pw},2,2^FS")
    for y in range(0, ll + 1, VLINE_LABEL_STEP):
        ly = y + 4 if y + 24 <= ll else y - 18
        for x in VLINE_LABEL_COLUMNS:
            parts.append(f"^FT{x},{ly}^A0N,16,16^FD{y}^FS")
    # Horizontal scale: ticks every 20 dots, labeled every 100. Labels use a
    # centered ^FB block; the x=0 block is clamped to the format origin.
    for x in range(0, pw + 10, TICK_STEP):
        major = x % TICK_LABEL_STEP == 0
        t = 3 if major else 2
        parts.append(f"^FO{x},{TICK_Y}^GB{t},{TICK_H},{t}^FS")
    for x in range(0, pw + 1, TICK_LABEL_STEP):
        lx = max(0, x - 25)
        parts.append(f"^FT{lx},{HLABEL_Y}^FB50,1,0,C,0^A0N,16,16^FD{x}^FS")
    parts.append("^XZ")
    return "\n".join(parts) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Print a calibration ruler label on the ZD421 label printer."
    )
    parser.add_argument(
        "--copies", type=int, default=1, help="number of ruler labels to print"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="write the ZPL to stdout, don't print"
    )
    args = parser.parse_args(argv)
    zpl = build_ruler_zpl()
    if args.copies > 1:
        zpl = zpl.replace("^XZ\n", f"^XZ\n^PQ{args.copies}\n", 1)
    if args.dry_run:
        sys.stdout.write(zpl)
        return 0
    send_to_printer(zpl)
    print(
        "Ruler label sent. Read off the label and report:\n"
        "  1. HORIZONTAL scale (numbers every 100: 0..800): smallest and\n"
        "     largest number fully visible\n"
        "  2. VERTICAL scale (numbers every 50: 0..200, two columns): smallest\n"
        "     and largest number fully visible\n"
        "  3. any number that is partially cut off at an edge"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())