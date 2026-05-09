"""ZPL label generation and printing service.

Generates ZPL II label strings for Zebra ZD421 (4" × 203 dpi) and sends
them via direct USB (pyusb) or a Linux device path.
"""

import sys

from app.config import LABEL_PRINTER_PATH

_PRINT_WIDTH = 812   # dots — ZD421 at 203 dpi, 4" stock
_ZEBRA_VID   = 0x0A5F
_ZEBRA_PID   = 0x0185


def _barcode_x(barcode: str) -> int:
    """Return the x origin (dots) that centers a Code 39 barcode on the label.

    Code 39 geometry at default module width (2 dots, ratio 3.0):
      - each symbol (including start/stop): 30 dots
      - inter-character gap: 2 dots
      - quiet zones (10× narrow bar): 20 dots each side
    """
    n_symbols    = len(barcode) + 2          # data chars + start + stop
    barcode_dots = n_symbols * 30 + (n_symbols - 1) * 2 + 40  # +40 quiet zones
    return max(0, (_PRINT_WIDTH - barcode_dots) // 2)


def generate_zpl(item) -> str:
    """Generate a ZPL II label string for the ZD421 (4", 203 dpi).

    Layout (all elements horizontally centered):
      - Code 39 barcode, 100 dots tall
      - Seller code + price (large)
      - Description, optional size/colour line, optional extra line
    """
    barcode      = item.barcode_39 or item.code
    seller_code  = item.seller.code if item.seller else ""
    description  = (item.description or "")[:30]
    line2        = item.label_line_2 or ""
    line3        = item.label_line_3 or ""
    bx           = _barcode_x(barcode)
    pw           = _PRINT_WIDTH

    return (
        "^XA\n"
        f"^FO{bx},5^BCN,100,Y,N,N^FD{barcode}^FS\n"
        f"^FO0,138^FB{pw},1,0,C,0^A0N,28,28^FD{seller_code}  ${item.price:.2f}^FS\n"
        f"^FO0,170^FB{pw},1,0,C,0^A0N,15,15^FD{description}^FS\n"
        f"^FO0,189^FB{pw},1,0,C,0^A0N,13,13^FD{line2}^FS\n"
        f"^FO0,206^FB{pw},1,0,C,0^A0N,13,13^FD{line3}^FS\n"
        "^XZ\n"
    )


def send_to_printer(zpl: str, printer_path: str = LABEL_PRINTER_PATH) -> None:
    """Send ZPL to the printer.

    On macOS: writes directly to the Zebra USB endpoint via pyusb.
    On Linux: writes raw bytes to the device path (e.g. /dev/usb/lp0).
    """
    if sys.platform == "darwin":
        _send_usb(zpl)
    else:
        with open(printer_path, "wb") as f:
            f.write(zpl.encode("utf-8"))


def _send_usb(zpl: str) -> None:
    """Write ZPL directly to the Zebra USB bulk-OUT endpoint (macOS)."""
    import usb.core
    import usb.util

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
