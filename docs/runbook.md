# Ski Swap POS — Runbook

Operational notes for running the Ski Swap POS on the event machine.
Captures the deployment topology, how to start, known data issues, and
troubleshooting. Keep this in sync with reality.

---

## 1. Architecture (this machine)

```
                       HTTPS
  browser ───────────────────────►  Caddy  ──reverse_proxy──►  FastAPI (uvicorn)
  (LAN stations)        :443         (root)        127.0.0.1:8001   │
                       :8000                                          ├─ /api/*  (JSON)
                       :80  → redirect to :443                        └─ /       (built React SPA from backend/static/)
```

- **Caddy** runs as a system service (`/usr/bin/caddy run --config /etc/caddy/Caddyfile`)
  and owns the public ports:
  - `:443`  → `https://mysl-pos.duckdns.org`            (primary, auto Let's Encrypt)
  - `:8000` → `https://mysl-pos.duckdns.org:8000`       (TLS alternate entry — **use the `https://` scheme**; :8000 is HTTPS, not plain HTTP)
  - `:80`   → redirects to :443
  Caddy reverse-proxies all of these to `127.0.0.1:8001`.
- **FastAPI** (`uvicorn app.main:app`) must bind to `127.0.0.1:8001`.
  It serves both the API (`/api`, `/auth`, `/events`, `/sellers`, `/intakes`,
  `/items`, `/sales`, `/reports`, `/admin`, `/docs`) and the **built React
  frontend** from `backend/static/` (served at `/` when that directory exists).
- **Frontend**: production build lives in `backend/static/` (rebuilt via
  `cd frontend && npm run build`). Caddy/the app serve this single-server; no
  separate Vite dev server is needed in normal operation.
- **DB**: SQLite at `backend/swap.db` (gitignored via `*.db`).
- **Backups**: `backend/swap.db` is backed up to `~/skiswap-backups/` every 6 h
  by `scripts/backup_db.py` (user crontab). Recovery procedure and storage
  strategy: **`docs/backup-recovery.md`**.

> **Caddy owns :8000.** Never bind uvicorn to :8000 on this machine — it will
> fail with `address already in use` and clash with Caddy's TLS listener.

---

## 2. Starting the app

Just run, from the repo root:

```bash
bash start.sh
```

`start.sh` does, in order:

1. **Install backend deps** into `backend/.venv` (creates the venv with `uv` if
   missing; installs `requirements.txt` via `uv pip`).
2. **Run migrations** — `alembic upgrade head`.
3. **Repair + seed** —
   - Idempotently repairs `sale.date_of_sale` values that were stored as the
     bare year `2026` (integer) instead of a full datetime; backfills from
     `sale.created_at`. No-op once the data is clean.
   - If there is no active event, runs `seed_demo.py` to populate demo data.
     Skips seeding if an active event already exists.
4. **Launch** `uvicorn` on `APP_HOST:APP_PORT` (defaults `127.0.0.1:8001`).

### Environment overrides

| Var | Default | Purpose |
|-----|---------|---------|
| `APP_HOST` | `127.0.0.1` | uvicorn bind host. Use `0.0.0.0` for LAN-direct dev **without** Caddy. |
| `APP_PORT` | `8001` | uvicorn port. Must stay `8001` when Caddy is in front. |
| `JWT_SECRET` | (persisted in `backend/.jwt_secret`) | HMAC secret for JWTs. If unset, loaded from `.jwt_secret`; if that file is missing, a new secret is generated and written there (chmod 600). Set explicitly to override. |

`backend/.jwt_secret` is gitignored. Persisting it keeps login tokens valid
across restarts; deleting it forces everyone to re-login.

### Running without Caddy (pure dev)

```bash
APP_HOST=0.0.0.0 APP_PORT=8000 bash start.sh     # backend only, LAN-direct
# (frontend hot-reload, in another terminal:)
cd frontend && npm run dev                        # http://localhost:5173, proxies API → :8000
```

---

## 3. Seeded demo data & logins

`seed_demo.py` is idempotent and only runs automatically when no active event
exists. It creates:

- 1 active event: **Ski Swap 2026** (30% commission)
- 3 users, 15 sellers (12 individual + 3 vendor), 15 intakes, 83 items, 10 sales

| Username  | Password     | Role    | Tabs visible             |
|-----------|-------------|---------|--------------------------|
| `admin`   | `admin123`  | admin   | Intake, POS, Admin       |
| `intake1` | `intake123`  | intake  | Intake                   |
| `cashier1`| `cashier123`| cashier | POS                      |

To re-seed from scratch: delete (or move aside) `backend/swap.db`, then
`bash start.sh` (migrations + seed run automatically).

---

## 4. Known data issue: `sale.date_of_sale` stored as the year `2026`

### Symptom
Any endpoint that reads `Sale` rows returned **HTTP 500** with:
```
TypeError: fromisoformat: argument must be str
```
(e.g. `GET /reports/{event_id}/revenue`). Re-running `seed_demo.py` on an
already-seeded DB crashed with the same error.

### Root cause
`Sale.date_of_sale` is declared as `Column(DateTime)`, but two code paths
passed a **`date`** object instead of a **`datetime`**:
- `seed_demo.py` used `date.fromisoformat(sale_date_str)`.
- An earlier version of `app/services/checkout.py` did the same.

SQLAlchemy's SQLite DateTime bind processor, handed a `date`, ended up
storing the bare year as the **integer `2026`**. On read-back the
`str_to_datetime` processor called `datetime.fromisoformat(2026)` and raised
`TypeError: fromisoformat: argument must be str` (it got an `int`).

### Fix
1. **`seed_demo.py`** now passes `datetime.fromisoformat(sale_date_str)`
   (`datetime.fromisoformat("2026-10-04")` → `datetime(2026,10,4,0,0)`).
2. **`app/services/checkout.py`** already uses `datetime.now(timezone.utc)`
   (fixed before this runbook; sale id 13 confirms a valid value).
3. **`start.sh`** runs an idempotent repair on every start:
   ```sql
   UPDATE sale SET date_of_sale = created_at
   WHERE date_of_sale IS NOT NULL AND typeof(date_of_sale) != 'text';
   ```
   This backfills any integer-year values from `created_at` (always a valid
   timestamp). It is a no-op once all rows are clean.

If you ever see the `fromisoformat` error again, run `bash start.sh` once —
the repair step will clear it.

---

## 5. Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `address already in use` on start, port 8000 | Caddy owns :8000. Don't bind uvicorn to 8000. Use the default `APP_PORT=8001`. |
| `curl http://...:8000` → `400 Client sent an HTTP request to an HTTPS server` | :8000 is HTTPS (Caddy). Use `https://...:8000`. |
| `GET /reports/.../revenue` → 500 `fromisoformat: argument must be str` | Corrupt `sale.date_of_sale` (integer year). Run `bash start.sh` to run the repair step. |
| Login worked but now 401 after restart | `JWT_SECRET` changed (e.g. `.jwt_secret` deleted). Re-login, or restore `.jwt_secret`. |
| `alembic: command not found` | You're outside `backend/` or the venv isn't activated. `start.sh` handles both; if running manually: `cd backend && source .venv/bin/activate`. |
| Blank page at `/` | `backend/static/` missing or stale. Rebuild: `cd frontend && npm run build`. |
| Re-seed duplicates (two events, etc.) | `seed_demo.py` is idempotent, but an earlier run before the fix left a duplicate inactive event (id 2). Safe to delete manually: `delete from event where id = 2;` |

---

## 6. Useful endpoints (behind Caddy or direct on :8001)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/login` | `{username,password}` → `{access_token}` |
| GET  | `/events` | requires auth |
| POST | `/events/{id}/activate` | set active event |
| GET  | `/reports/{event_id}/revenue` | event revenue (was the canary for the date bug) |
| GET  | `/reports/{event_id}/seller/{seller_id}` | seller payout |
| POST | `/admin/backup` | ZIP backup of the DB |
| GET  | `/docs` | Swagger UI (direct on :8001; Caddyfile has an optional basicauth block to hide it from the internet) |

Interactive Swagger docs: `http://localhost:8001/docs` (direct) — not exposed
through Caddy by default.