import os

DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./swap.db")
JWT_SECRET: str = os.getenv("JWT_SECRET", "change-me-before-event-day")
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRE_MINUTES: int = 480  # 8-hour shift
LABEL_PRINTER_PATH: str = os.getenv("LABEL_PRINTER_PATH", "/dev/usb/lp0")
