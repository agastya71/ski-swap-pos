# Ski Swap POS

A local-network web app for Minnesota Youth Ski League's annual ski equipment consignment swap. Replaces the legacy SwapSoft (4D database) system. Designed for 4–5 simultaneous checkout stations on local WiFi — no internet required on event day.

**Stack:** FastAPI + SQLite (backend) · React 19 + TypeScript + Vite (frontend)

---

## Prerequisites

- Python 3.11+
- Node.js 20+
- pip

---

## Running locally (development)

### 1. Backend

```bash
cd backend
pip install -r requirements.txt

# Apply database migrations
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### 2. Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`. The Vite dev server proxies all API calls to `localhost:8000` automatically — no CORS configuration needed.

---

## Seeding the database

The app requires an active event and at least one user before anyone can log in. Use the API to seed a fresh database:

```bash
# 1. Create an event
curl -s -X POST http://localhost:8000/events \
  -H "Content-Type: application/json" \
  -d '{"name": "MYSL Ski Swap 2026", "year": 2026, "commission_rate": 0.3}' | python3 -m json.tool

# 2. Activate it (use the id returned above, e.g. 1)
curl -s -X POST http://localhost:8000/events/1/activate | python3 -m json.tool

# 3. Create an admin user
#    First, get a token — but there are no users yet, so use the /users endpoint
#    directly (it requires an active event; no auth required for first user creation
#    — see backend/app/routers/users.py for any bootstrap exceptions, or seed via script)
```

> **Tip:** For development, you can also insert seed data directly into `backend/swap.db` using any SQLite client, or write a one-off seed script in `backend/`.

---

## Logging in

Once an event is active and a user exists:

1. Open `http://localhost:5173`
2. Enter the username and password created above
3. The nav bar shown after login depends on role:
   - **admin** — Intake, POS, Admin tabs
   - **intake** — Intake tab only
   - **cashier** — POS tab only

---

## Running the tests

### Backend (153 tests)

```bash
cd backend
python -m pytest tests/ -q
```

### Frontend (Vitest)

```bash
cd frontend
npm test
```

---

## Production build

To serve the frontend through FastAPI (single-server deployment on event day):

```bash
cd frontend
npm run build
```

This outputs the compiled app to `backend/static/`. FastAPI automatically serves it at `/` when that directory exists. Navigate to `http://localhost:8000` to use the production build.

---

## Project structure

```
ski-swap-pos/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + router registration
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── routers/         # API route handlers
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   └── services/        # Business logic
│   ├── migrations/          # Alembic migration scripts
│   └── tests/               # pytest test suite
└── frontend/
    ├── src/
    │   ├── api/             # Typed API client modules
    │   ├── auth/            # AuthContext + LoginPage
    │   ├── components/      # Layout, ProtectedRoute
    │   ├── mocks/           # MSW handlers for tests
    │   └── types.ts         # TypeScript interfaces (mirrors backend schemas)
    ├── vitest.config.ts
    └── vite.config.ts
```

---

## API reference

Interactive Swagger docs are available at `http://localhost:8000/docs` when the backend is running.

Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login (JSON `{username, password}`), returns JWT |
| GET | `/events` | List events |
| POST | `/events` | Create event |
| POST | `/events/{id}/activate` | Set active event |
| GET/POST | `/sellers` | Search / create sellers |
| POST | `/intakes` | Create intake for a seller |
| POST | `/intakes/{id}/items` | Add item to intake |
| GET | `/items/lookup?code=` | Look up item by barcode for checkout |
| POST | `/sales` | Record a sale |
| GET | `/reports/{event_id}/revenue` | Event revenue report |
| GET | `/reports/{event_id}/seller/{seller_id}` | Seller payout report |
| POST | `/admin/backup` | Download ZIP backup of database |
