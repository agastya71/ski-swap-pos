import os


def _env_int(name: str, default: int) -> int:
    """Read an integer env var; invalid values fall back to the default."""
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./swap.db")
JWT_SECRET: str = os.getenv("JWT_SECRET", "change-me-before-event-day")
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRE_MINUTES: int = 480  # 8-hour shift
LABEL_PRINTER_PATH: str = os.getenv("LABEL_PRINTER_PATH", "/dev/usb/lp0")
LABEL_PRINTER_QUEUE: str = os.getenv("LABEL_PRINTER_QUEUE", "ZTC-ZD421-203dpi-ZPL")
# Label geometry/darkness (dots at 203 dpi) — measured on the live ZD421
# 2026-09-12 (media ≈ 3" × 1", origin ~120 dots left of media). The printer
# prints BLANK unless ^PW/^LL/^LS/^MD are set explicitly on every label.
LABEL_WIDTH_DOTS: int = _env_int("LABEL_WIDTH_DOTS", 600)
LABEL_LENGTH_DOTS: int = _env_int("LABEL_LENGTH_DOTS", 190)
LABEL_LEFT_SHIFT_DOTS: int = _env_int("LABEL_LEFT_SHIFT_DOTS", 115)
LABEL_DARKNESS: int = _env_int("LABEL_DARKNESS", 20)
BACKUP_DIR: str = os.getenv("BACKUP_DIR", "backups")
