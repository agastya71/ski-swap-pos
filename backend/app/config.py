import os
import sys


def _env_int(name: str, default: int) -> int:
    """Read an integer env var; invalid values fall back to the default."""
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


PLATFORM_KEY = (
    "darwin"
    if sys.platform == "darwin"
    else "windows"
    if sys.platform.startswith("win")
    else "linux"
)

# Per-OS label-printer presets — transport + defaults selected by the OS the
# app runs on. Host-specific values are overridden by env vars:
# LABEL_TRANSPORT ("usb" | "device" | "cups" | "auto"), LABEL_PRINTER_PATH,
# LABEL_PRINTER_QUEUE.
PRINTER_OS_PRESETS: dict[str, dict[str, str]] = {
    # systemd daemon deployment: raw device node first, then the CUPS queue
    # (byte-for-byte ZPL passthrough; the queue must be created raw via
    # "sudo lpadmin -p <name> -E -m raw -v usb://Zebra...").
    "linux": {
        "transport": "auto",
        "device": "/dev/usb/lp0",
        "cups_queue": "ZTC-ZD421-203dpi-ZPL",
    },
    # macOS: direct USB write via pyusb (VID/PID-matched Zebra);
    # requires pyusb in the venv.
    "darwin": {
        "transport": "usb",
    },
    # Windows: no winspool/IPP path implemented — label endpoints return 503
    # with a clear message.
    "windows": {
        "transport": "unsupported",
    },
}

# Optional explicit transport override ("usb" | "device" | "cups" | "auto");
# empty = use the OS preset.
LABEL_TRANSPORT: str = os.getenv("LABEL_TRANSPORT", "")

_LABEL_PRESET = PRINTER_OS_PRESETS[PLATFORM_KEY]
LABEL_PRINTER_PATH: str = os.getenv("LABEL_PRINTER_PATH", "") or _LABEL_PRESET.get(
    "device", ""
)
LABEL_PRINTER_QUEUE: str = os.getenv("LABEL_PRINTER_QUEUE", "") or _LABEL_PRESET.get(
    "cups_queue", ""
)


DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./swap.db")
JWT_SECRET: str = os.getenv("JWT_SECRET", "change-me-before-event-day")
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRE_MINUTES: int = 480  # 8-hour shift
LABEL_PRINTER_PATH: str = os.getenv("LABEL_PRINTER_PATH", "/dev/usb/lp0")
LABEL_PRINTER_QUEUE: str = os.getenv("LABEL_PRINTER_QUEUE", "ZTC-ZD421-203dpi-ZPL")
# Label geometry (dots at 203 dpi) — measured on the live ZD421 via the
# ^FT calibration ruler (2026-09-13, post media-calibration): the label
# surface spans ~275..830 in printhead coordinates; content origin/edge are
# set inside that window. The printer prints BLANK unless ^PW/^LL/^MD are
# set explicitly on every label; ^FT-positioned text ignores ^LS, so the
# left origin is baked into each field's x coordinate instead.
LABEL_LEFT_ORIGIN_DOTS: int = _env_int("LABEL_LEFT_ORIGIN_DOTS", 280)
LABEL_RIGHT_EDGE_DOTS: int = _env_int("LABEL_RIGHT_EDGE_DOTS", 850)
LABEL_LENGTH_DOTS: int = _env_int("LABEL_LENGTH_DOTS", 203)  # media ≈ 2" tall (blank space below the content in every test print)
LABEL_DARKNESS: int = _env_int("LABEL_DARKNESS", 20)
BACKUP_DIR: str = os.getenv("BACKUP_DIR", "backups")
