from app.config import LABEL_PRINTER_PATH


def generate_zpl(item) -> str:
    """Generate a ZPL II label string for a 2" x 1.25" label at 203 dpi.

    Layout:
      - Code 39 barcode of item.barcode_39 (fallback: item.code)
      - Seller code + price
      - Description (truncated to 30 chars)
      - label_line_2 and label_line_3
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
    """Write raw ZPL bytes to the USB label printer device path."""
    with open(printer_path, "wb") as f:
        f.write(zpl.encode("utf-8"))
