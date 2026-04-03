from fastapi import FastAPI

from app.routers import auth

app = FastAPI(title="Ski Swap POS", version="1.0.0")

app.include_router(auth.router)


@app.get("/health")
def health():
    return {"status": "ok"}
