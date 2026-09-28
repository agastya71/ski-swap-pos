"""Tests for scripts/label_ruler.py — the label-geometry calibration ruler.

The script is loaded from its file (backend/scripts/ is not a package).
These tests only exercise ZPL generation; nothing here touches a printer.
"""

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "label_ruler.py"
_spec = importlib.util.spec_from_file_location("label_ruler", SCRIPT)
assert _spec and _spec.loader
label_ruler = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(label_ruler)


def test_ruler_zpl_carries_format_commands():
    zpl = label_ruler.build_ruler_zpl()
    assert zpl.startswith("^XA\n")
    assert zpl.endswith("^XZ\n")
    assert "^MD20" in zpl
    assert f"^LL{label_ruler.LABEL_LENGTH_DOTS}" in zpl
    assert "^PW850" in zpl  # wider than the media on purpose
    assert "^CI0" in zpl


def test_ruler_zpl_scales_are_complete():
    zpl = label_ruler.build_ruler_zpl()
    # Vertical scale: a full-width line at every 25-dot step…
    assert "^FO0,0^GB850,2,2^FS" in zpl
    assert "^FO0,100^GB850,2,2^FS" in zpl
    assert "^FO0,200^GB850,2,2^FS" in zpl
    # …labeled every 50 dots in both columns (y=200's label sits above its line).
    assert "^FT330,104^A0N,16,16^FD100^FS" in zpl
    assert "^FT650,54^A0N,16,16^FD50^FS" in zpl
    assert "^FT330,182^A0N,16,16^FD200^FS" in zpl
    # Horizontal scale: ticks every 20 dots in the y=130..148 band…
    assert "^FO520,130^GB2,18,2^FS" in zpl  # minor (not a 50 multiple)
    assert "^FO500,130^GB3,18,3^FS" in zpl  # major every 50
    assert "^FO840,130^GB2,18,2^FS" in zpl  # last tick — past the ≈830 media edge
    # …labeled every 50 dots (the x=0 label block is clamped to the origin).
    assert "^FT25,156^FB50,1,0,C,0^A0N,16,16^FD50^FS" in zpl
    assert "^FT125,156^FB50,1,0,C,0^A0N,16,16^FD150^FS" in zpl
    assert "^FT425,156^FB50,1,0,C,0^A0N,16,16^FD450^FS" in zpl
    assert "^FT0,156^FB50,1,0,C,0^A0N,16,16^FD0^FS" in zpl
    assert "^FT775,156^FB50,1,0,C,0^A0N,16,16^FD800^FS" in zpl
    # The y=150 vertical label prints at x=450 (avoids the 350/650 h-labels).
    assert "^FT450,154^A0N,16,16^FD150^FS" in zpl
    assert "^FT330,154" not in zpl
    # Header moved below the off-media top band (media top ≈12 per the
    # 2026-09-27 ruler print).
    assert "^FT280,29^FB530,1,0,C,0^A0N,16,16^FDCALIBRATION RULER^FS" in zpl


def test_ruler_main_dry_run_writes_zpl(capsys):
    assert label_ruler.main(["--dry-run"]) == 0
    out = capsys.readouterr().out
    assert out.startswith("^XA\n")
    assert out.endswith("^XZ\n")