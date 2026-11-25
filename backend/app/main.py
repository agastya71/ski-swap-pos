import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.routers import auth, events, users, sellers, intakes, items
from app.routers.sales import router as sales_router
from app.routers.reports import router as reports_router
from app.routers.admin import router as admin_router

# Root logging config: uvicorn configures its OWN loggers only, so app-level
# logging.getLogger(__name__) calls (admin.py, services/zpl.py, audit lines in
# services/auth.py) would otherwise be discarded below WARNING. APP_LOG_LEVEL
# overrides the root level (DEBUG|INFO|WARNING|ERROR; default INFO).
logging.basicConfig(
    level=os.getenv("APP_LOG_LEVEL", "INFO").upper(),
    format="%(levelname)s:%(name)s:%(message)s",
)
logging.getLogger("app").setLevel(os.getenv("APP_LOG_LEVEL", "INFO").upper())

app = FastAPI(title="Ski Swap POS", version="1.0.0")

# Phase G: bind the event-data engine to the registry's active event DB (if a
# registry exists). No-op otherwise — legacy single-DB mode keeps DATABASE_URL.
from app.database import resolve_active_event as _resolve_active_event

_bound: str | None = _resolve_active_event()
if _bound:
    print(f"[events] active event DB: {_bound}")

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(users.router)
app.include_router(sellers.router)
app.include_router(intakes.router)
app.include_router(items.router)
app.include_router(sales_router)
app.include_router(reports_router)
app.include_router(admin_router)


@app.get("/health")
def health():
    return {"status": "ok"}


# Documentation downloads for the web UI (whitelist-only; public how-to docs).
# The repo's docs/ directory sits two levels above app/ (repo root / docs).
DOCS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "docs")
_DOCS_ALLOWED = frozenset({"user-guide.pdf", "user-guide.md"})


@app.get("/docs/{filename}", include_in_schema=False)
def get_document(filename: str):
    if filename not in _DOCS_ALLOWED:
        raise HTTPException(status_code=404, detail="Document not found")
    return FileResponse(os.path.join(DOCS_DIR, filename))


_STATIC = os.path.join(os.path.dirname(__file__), "..", "static")

# Variant-build mount for UI overhaul A/B testing — see
# docs/ui-overhaul-ab-plan-2026-11-24.md. Registered BEFORE the "/" catch-all:
# FastAPI matches mounts in registration order, and a later "/" mount would
# swallow /next. Optional: absent directory → plain 404s; the production
# bundle in _STATIC is never touched by A/B testing.
_STATIC_NEXT = os.path.join(os.path.dirname(__file__), "..", "static-next")
if os.path.isdir(_STATIC_NEXT):
    app.mount("/next", StaticFiles(directory=_STATIC_NEXT, html=True), name="frontend-next")

if os.path.isdir(_STATIC):
    app.mount("/", StaticFiles(directory=_STATIC, html=True), name="frontend")
