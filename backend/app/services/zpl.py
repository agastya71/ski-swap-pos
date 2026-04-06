"""ZPL label generation and printing service.

Generates ZPL II label strings for Zebra-compatible USB label printers and
writes them directly to the printer device path configured in ``app.config``.
Labels are sized for 2" × 1.25" stock at 203 dpi.
"""

from app.config import LABEL_PRINTER_PATH


def generate_zpl(item) -> str:
    """Generate a ZPL II label string for a 2" × 1.25" label at 203 dpi.

    The label layout is:

    * Code 39 barcode — uses ``item.barcode_39`` when set, falls back to
      ``item.code``.
    * Seller code and price on one line.
    * Item description truncated to 30 characters.
    * Two optional free-text lines from ``item.label_line_2`` and
      ``item.label_line_3``.

    Args:
        item: An Item ORM instance (with ``seller`` relationship loaded)
            providing ``barcode_39``, ``code``, ``seller``, ``price``,
            ``description``, ``label_line_2``, and ``label_line_3``.

    Returns:
        A complete ZPL II string beginning with ``^XA`` and ending with
        ``^XZ``, ready to be sent to a Zebra-compatible printer.
    """
    barcode = item.barcode_39 or item.code
    seller_code = item.seller.code if item.seller else ""
    description = (item.description or "")[:30]
    line2 = item.label_line_2 or ""
    line3 = item.label_line_3 or ""

    return (
        "^XA\n"
        f"^FO20,10^BCN,50,Y,N,N^FD{barcode}^FS\n"
        f"^FO20,72^A0N,22,22^FD{seller_code}  ${item.price:.2f}^FS\n"
        f"^FO20,98^A0N,18,18^FD{description}^FS\n"
        f"^FO20,120^A0N,16,16^FD{line2}^FS\n"
        f"^FO20,140^A0N,16,16^FD{line3}^FS\n"
        "^XZ"
    )


def send_to_printer(zpl: str, printer_path: str = LABEL_PRINTER_PATH) -> None:
    """Write raw ZPL bytes to the USB label printer device path.

    Args:
        zpl: A ZPL II string as returned by ``generate_zpl``.
        printer_path: Filesystem path to the printer device (e.g.
            ``"/dev/usb/lp0"``).  Defaults to ``LABEL_PRINTER_PATH`` from
            ``app.config``.

    Raises:
        OSError: If the device path does not exist or cannot be opened for
            writing.
    """
    with open(printer_path, "wb") as f:
        f.write(zpl.encode("utf-8"))
