import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.routers import auth, events, users, sellers, intakes, items
from app.routers.sales import router as sales_router
from app.routers.reports import router as reports_router
from app.routers.admin import router as admin_router

app = FastAPI(title="Ski Swap POS", version="1.0.0")

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
if os.path.isdir(_STATIC):
    app.mount("/", StaticFiles(directory=_STATIC, html=True), name="frontend")
