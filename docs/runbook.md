# Ski Swap POS — Runbook

Operational notes for running the Ski Swap POS on the event machine.
Captures the deployment topology, how to start, known data issues, and
troubleshooting. Keep this in sync with reality.

---

## 1. Architecture (this machine)

```text
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
| ----- | --------- | --------- |
| `APP_HOST` | `127.0.0.1` | uvicorn bind host. Use `0.0.0.0` for LAN-direct dev **without** Caddy. |
| `APP_PORT` | `8001` | uvicorn port. Must stay `8001` when Caddy is in front. |
| `JWT_SECRET` | (persisted in `backend/.jwt_secret`) | HMAC secret for JWTs. If unset, loaded from `.jwt_secret`; if that file is missing, a new secret is generated and written there (chmod 600). Set explicitly to override. |

`backend/.jwt_secret` is gitignored. Persisting it keeps login tokens valid
across restarts; deleting it forces everyone to re-login.

### Running without Caddy (pure dev)

```bash
APP_HOST=0.0.0.0 APP_PORT=8000 bash start.sh     # backend only, LAN-direct
```bash
# (frontend hot-reload, in another terminal:)
```cd frontend && npm run dev                        # http://localhost:5173, proxies API → :8000
```

### Run as a system daemon at boot (systemd)

The app runs as a **system service** (`ski-swap-pos.service`) that starts
automatically after a reboot and restarts itself if it exits. It runs
`start.sh` as the repo owner, so behavior is identical to a manual run.

One-time install (substitutes repo dir/user into the unit template):

```bash
sudo bash deploy/install-service.sh
```

The installer refuses to start the daemon while something is already
listening on :8001 (a manually-started `bash start.sh`); it prints the exact
kill + `systemctl start` handover steps in that case.

Day-to-day management:

```bash
systemctl status ski-swap-pos        # is it running?
journalctl -u ski-swap-pos -f        # live logs (uvicorn output)
sudo systemctl restart ski-swap-pos  # pick up code changes
sudo systemctl disable --now ski-swap-pos   # stop + disable boot start
```

- Unit source (template with `__PLACEHOLDER__`s): `deploy/ski-swap-pos.service`;
  installed copy: `/etc/systemd/system/ski-swap-pos.service`. Re-run the
  installer after editing the template.
- `Restart=always` + `RestartSec=5`: the daemon recovers from crashes, failed
  migrations, etc. `systemctl stop` always wins (no restart loop on purpose).
- Shuts down gracefully (`KillSignal=SIGINT`) — in-flight checkouts finish.
- Caddy is independent: it starts on its own and simply gets connection
  refused for the few seconds before the app is up.

---

## 3. Seeded demo data & logins

`seed_demo.py` is idempotent and only runs automatically when no active event
exists. It creates:

- 1 active event: **TEST SWAP POS 2026** (30% commission)
- 3 users, 15 sellers (12 individual + 3 vendor), 15 intakes, 83 items, 10 sales

| Username   | Password     | Role    | Tabs visible             |
| ---------- | ------------ | ------- | ------------------------ |
| `admin`    | `admin123`   | admin   | Intake, POS, Admin       |
| `intake1`  | `intake123`  | intake  | Intake                   |
| `cashier1` | `cashier123` | cashier | POS                      |

To re-seed from scratch: delete (or move aside) `backend/swap.db`, then
`bash start.sh` (migrations + seed run automatically).

---

## 4. Known data issue: `sale.date_of_sale` stored as the year `2026`

### Symptom

Any endpoint that reads `Sale` rows returned **HTTP 500** with:

```text
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
| --- | --- |
| `address already in use` on start, port 8000 | Caddy owns :8000. Don't bind uvicorn to 8000. Use the default `APP_PORT=8001`. |
| `curl http://...:8000` → `400 Client sent an HTTP request to an HTTPS server` | :8000 is HTTPS (Caddy). Use `https://...:8000`. |
| `GET /reports/.../revenue` → 500 `fromisoformat: argument must be str` | Corrupt `sale.date_of_sale` (integer year). Run `bash start.sh` to run the repair step. |
| Login worked but now 401 after restart | `JWT_SECRET` changed (e.g. `.jwt_secret` deleted). Re-login, or restore `.jwt_secret`. |
| `alembic: command not found` | You're outside `backend/` or the venv isn't activated. `start.sh` handles both; if running manually: `cd backend && source .venv/bin/activate`. |
| Daemon crash-loops (`systemctl status` shows restarts), `address already in use` on 8001 | A manually-started `bash start.sh` still holds :8001. Kill it (`ss -ltnp 'sport = :8001'`), then `sudo systemctl restart ski-swap-pos`. |
| `systemctl status ski-swap-pos` → `failed (result: exit-limit...)` or repeated dep-install errors | Read `journalctl -u ski-swap-pos -n 100`. Common causes: no network for `uv pip install` at boot, or `uv` missing from the unit's PATH (re-run `sudo bash deploy/install-service.sh`). |
| Blank page at `/` | `backend/static/` missing or stale. Rebuild: `cd frontend && npm run build`. |
| Re-seed duplicates (two events, etc.) | `seed_demo.py` is idempotent, but an earlier run before the fix left a duplicate inactive event (id 2). Delete it in the admin UI (Events → Delete on the inactive event) or `DELETE /events/{id}` — this cascades all of the event's data. The manual-SQL fallback: `delete from event where id = 2;` (only safe when the event has no related rows). |

---

## 6. Useful endpoints (behind Caddy or direct on :8001)

| Method | Path | Notes |
| -------- | ------ | ------- |
| POST | `/auth/login` | `{username,password}` → `{access_token}` |
| GET | `/events` | requires auth |
| POST | `/events/{id}/activate` | set active event |
| DELETE | `/events/{id}` | admin-only. Permanently deletes an inactive event + all its data (sales, items, intakes, sellers, users). Blocked for the active event and for the event the caller belongs to. Returns per-type deleted counts. |
| GET | `/reports/{event_id}/revenue` | event revenue (was the canary for the date bug) |
| GET | `/reports/{event_id}/seller/{seller_id}` | seller payout |
| POST | `/admin/backup` | ZIP backup of the DB |
| GET | `/docs` | Swagger UI (direct on :8001; Caddyfile has an optional basicauth block to hide it from the internet) |

Interactive Swagger docs: `http://localhost:8001/docs` (direct) — not exposed
through Caddy by default.

---

## 7. Label printer (Zebra ZD421, ZPL)

The label printer is a **Zebra ZD421-203dpi ZPL** (USB). The app generates ZPL
in `app/services/zpl.py` and delivers it with `send_to_printer`, which picks
the transport from **per-OS presets** (`PRINTER_OS_PRESETS` in
`app/config.py`), optionally overridden by `LABEL_TRANSPORT`
(`usb` | `device` | `cups` | `auto`).

### Linux (and variants — Debian/Ubuntu, Fedora/RHEL, Arch, …)

- Default preset `transport: auto` — raw device write first
  (`LABEL_PRINTER_PATH`, default `/dev/usb/lp0`), then the CUPS queue
  (`LABEL_PRINTER_QUEUE`, default `ZTC-ZD421-203dpi-ZPL`) via
  `lp -d <queue> -o raw` (byte-for-byte ZPL passthrough).
- The CUPS queue must be **raw** — a driver-backed queue mangles ZPL (this
  host initially had an HP DesignJet PPD on the Zebra queue → blank feeds):

  ```bash
  sudo lpadmin -p ZTC-ZD421-203dpi-ZPL -E -m raw \
    -v 'usb://Zebra%20Technologies/ZTC%20ZD421-203dpi%20ZPL?serial=D8N231601489'
  ```

  (`lpinfo -v` lists the exact USB URI on your host.) CUPS prints a
  "Raw queues are deprecated" warning — non-blocking today.
- The systemd unit's PATH includes `/usr/bin` (where `lp` lives), so the CUPS
  fallback works inside the daemon.
- A raw device node (`/dev/usb/lp0`) only exists while the `usblp` module
  holds the device; when CUPS claims it the node disappears — which is why
  the CUPS fallback exists.

### macOS

- Preset `transport: usb` — direct USB write via pyusb (VID/PID `0a5f:0185`).
  Requires `pyusb` in the venv (`uv pip install pyusb`; it is NOT in
  `requirements.txt` by default) and libusb (`brew install libusb`). If
  pyusb is missing, label endpoints return 503 with "pyusb is required".

### Windows

- Preset `transport: unsupported` — no winspool/IPP path is implemented;
  label endpoints return 503 "Label printing is not supported on windows".
  (If ever needed: add a winspool path to `send_to_printer`, printing via
  the Windows spooler with the Zebra installed as a raw/ZPL port.)

### Per-host env overrides (no code changes)

| Variable                | Default (linux preset)   | Notes                                        |
| ----------------------- | ------------------------ | -------------------------------------------- |
| `LABEL_TRANSPORT`       | *(OS preset)*            | force `usb` / `device` / `cups` / `auto`     |
| `LABEL_PRINTER_PATH`    | `/dev/usb/lp0`           | raw device node; tried first in `auto`       |
| `LABEL_PRINTER_QUEUE`   | `ZTC-ZD421-203dpi-ZPL`   | CUPS queue name (host-specific)              |
| `LABEL_WIDTH_DOTS`      | `600`                    | measured: ≈3" media                          |
| `LABEL_LENGTH_DOTS`     | `190`                    | measured: ≈1" media                          |
| `LABEL_LEFT_SHIFT_DOTS` | `115`                    | origin sits ~120 dots left of media edge     |
| `LABEL_DARKNESS`        | `20`                     | 0–30                                         |

Geometry/darkness are **media- and printer-specific, not OS-specific** — the
same values apply on any OS with this printer and stock.

### Troubleshooting: labels feed but print blank

1. The queue is not **raw** — a driver-backed queue (this host had an HP
   DesignJet PPD on the Zebra queue) mangles ZPL → blank feeds. Check:
   `lpoptions -p <queue>` (HP\* options = wrong driver).
2. Older builds sent ZPL **without** explicit `^PW/^LL/^LS/^MD/^CI0` — the
   ZD421 prints blank unless these are set on every label (fixed in PR #88).
3. LEDs (the ZD421 has no display): green diamond = ready; lit PAUSE =
   paused (press the Pause button or send `~PS` + `~JC` to recalibrate); red
   NETWORK = the unused Ethernet interface (irrelevant to USB printing).
