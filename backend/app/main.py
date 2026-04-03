from fastapi import FastAPI

from app.routers import auth, events, users, sellers, intakes, items

app = FastAPI(title="Ski Swap POS", version="1.0.0")

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(users.router)
app.include_router(sellers.router)
app.include_router(intakes.router)
app.include_router(items.router)


@app.get("/health")
def health():
    return {"status": "ok"}
