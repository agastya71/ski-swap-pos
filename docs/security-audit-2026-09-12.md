# Security Audit — Phase 0 Baseline

> Date: 2026-09-12 · Scope: exposure, authn/authz, secrets, file perms, host posture.
> Method: static inspection + **live HTTP probes against 127.0.0.1:8001** (methods as
> shown; `422` = validation on empty body, i.e. route exists and is reachable only
> with valid auth where noted). Companion plan: `docs/security-plan.md`.

---

## 1. What's already in place ✓

| Control | Status | Evidence |
| --- | --- | --- |
| App binds localhost only | ✓ | `ss -tln`: uvicorn on `127.0.0.1:8001`; Caddy owns public ports |
| Every probed API route requires auth | ✓ | No-token probes: `/events` 403 · `/items/lookup` 403 · `/sellers` 403 · `/users` 403 · `/reports/1/revenue` 403 · `POST /sales` 403 · `POST /admin/backup` 403 |
| Role guards on routers | ✓ | `require_roles(...)` used via module constants: events/users/admin → admin; intakes/sellers → admin+intake; sales → cashier+admin; items/reports similar (verify per-route granularity in Phase 3 matrix) |
| Password hashing | ✓ | bcrypt via passlib (`app/services/auth.py`) |
| Token lifetime | ✓ | `JWT_EXPIRE_MINUTES=480` (8-hour shift) — matches shift model |
| Secret file perms | ✓ | `backend/.jwt_secret` 600 |
| No CORS middleware | ✓ | same-origin SPA; cross-origin browser reads blocked by default |
| No hardcoded app secrets in code | ✓ | scan of `backend/app` + `frontend/src` found none (exception: config fallback, §2) |
| Auto security updates | ✓ | `unattended-upgrades` installed + `20auto-upgrades` present |
| Event-delete guards | ✓ | admin-only; blocks active event + caller's own event (code-inspected) |

## 2. Findings (severity-ordered)

| # | Sev | Finding | Evidence | Plan item |
| --- | ----- | --------- | ---------- | ----------- |
| 1 | **CRITICAL** | Swagger UI + OpenAPI spec publicly served | `GET /docs` → 200, `GET /openapi.json` → 200; Caddyfile basicauth block commented out. Hands attackers the full API map + lets them probe every endpoint | P1.5 |
| 2 | **HIGH** | `JWT_SECRET` hardcoded fallback `"change-me-before-event-day"` in `app/config.py` | Running uvicorn without `start.sh` boots with a known secret → **forgeable admin tokens** | P1.6 |
| 3 | **HIGH** | Weak demo credentials live (`admin123`, `intake123`, `cashier123`); no min-length policy; no force-change flag | `seed_demo.py` users active in DB (reseeded 2026-09-12) | P1.4 |
| 4 | MED | No rate limiting or account lockout on `POST /auth/login`; no auth event logging | grep: no slowapi/throttle/lockout in `backend/app` | P2.10, P3.15 |
| 5 | MED | `swap.db` + `.bak` + `.bak-pre-clear-*` are 644 (world-readable) | `ls -la backend/swap.db*` | P4.19 |
| 6 | MED | Three public ports (80/443/8000); firewall state unverified | Caddyfile: three site blocks; `sudo ufw status` not runnable without sudo | P2.9, P1.8 |
| 7 | LOW | No-token requests return **403** not 401 (HTTPBearer default) — cosmetic; pick one convention for the matrix tests | live probes §1 | P3.13 |
| 8 | LOW | JWT secret rotation procedure undocumented | runbook has no rotation section | P1.7 |
| 9 | INFO | systemd unit lacks sandboxing directives; SSH config unverified | `deploy/ski-swap-pos.service` | P4.18, P2.11 |
| 10 | INFO | User-guide PDF/MD served at `/docs/user-guide.*` (intended feature) — note when gating Swagger: **don't gate `/docs/*` wholesale**, or the user guide is blocked too | `app/main.py` route + Caddyfile | P1.5 |

## 3. Verified authz snapshot (route-prefix → roles)

| Prefix | Roles | Source |
| -------- | ------- | -------- |
| `POST /auth/login` | public | code |
| `/auth/me`, `/auth/generate-password`, `/auth/change-password` | any authenticated | code |
| `/events` (create/list/activate/delete) | admin | code + live |
| `GET /events/active` | any authenticated | code |
| `/intakes` | admin, intake | code |
| `/sales` | cashier, admin | code + live |
| `/users`, `/admin` (incl. backup) | admin | code + live |
| `/items`, `/sellers`, `/reports` | authed (granularity to verify in Phase 3 matrix) | live 403 unauth |

## 4. Immediate risk statement

With Swagger public + a known secret fallback + demo passwords public knowledge, an
internet attacker can currently: map every endpoint, try `admin123` (succeeds), and
— if the app is ever started outside `start.sh` — forge admin JWTs outright. Items
P1.4–P1.6 close all three. Until then, treat the service as effectively open to
anyone who finds the hostname.
