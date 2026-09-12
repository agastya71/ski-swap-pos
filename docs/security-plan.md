# Security Plan — Ski Swap POS

> Goal: prevent unauthorized access to the POS service and its data, with layered
> guardrails: **edge (Caddy) → application (authn/authz) → host → operations**.
>
> Status markers: `[ ]` todo · `[x]` done. Companion baseline audit:
> `docs/security-audit-2026-09-12.md`.

---

## Current exposure snapshot (verified 2026-09-12)

- Public entry via Caddy on **:443, :8000 (TLS alternate), :80 (redirect)** →
  `mysl-pos.duckdns.org` → all proxied to `127.0.0.1:8001` (app is localhost-only ✓).
- **Swagger UI (`/docs`) + `/openapi.json` publicly reachable** (HTTP 200) — the
  Caddyfile basicauth block is commented out.
- **Weak demo credentials are live**: `admin/admin123`, `intake1/intake123`,
  `cashier1/cashier123`; no password length policy; no force-change-on-first-login.
- **No rate limiting / lockout anywhere**; no auth event audit log.
- JWT (bcrypt ✓), `JWT_EXPIRE_MINUTES=480` (8-hour shift ✓); **`JWT_SECRET` has a
  hardcoded fallback `"change-me-before-event-day"`** in `app/config.py`.
- `.jwt_secret` is 600 ✓; `swap.db` and DB backups are 644 (world-readable on host).
- No CORS middleware (same-origin only — correct for this SPA; keep it).
- unattended-upgrades installed ✓; firewall state unverified.
- All API routes require auth (verified live 2026-09-12 — see audit doc).

---

## Phase 0 — Baseline (½ day)

1. `[x]` Internal recon of exposure + authz matrix (see `docs/security-audit-2026-09-12.md`).
2. `[ ]` External port scan (nmap from a different network) → confirm only 80/443(/8000) respond.
3. `[ ]` Verify firewall reality (`sudo ufw status` / iptables) and document it.

## Phase 1 — P0 credential & exposure fixes (1 day)

1. `[ ]` **Kill the demo passwords**: rotate all 3 seeded users to strong passwords
   (or deactivate unneeded accounts). Add a `must_change_password` flag → force
   password change on first login. Enforce min length ≥ 12 in the auth schema + the
   existing suggest/generate UI.
2. `[ ]` **Lock down Swagger** — note: `/docs/*` also serves the *user guide*
   (`/docs/user-guide.pdf|.md`), so gate the FastAPI docs specifically:
   - Preferred (app-level): when not in dev, set `docs_url=None, redoc_url=None,
     openapi_url=None` in `app/main.py`; keep `/docs/{filename}` (user guide) public.
   - Or Caddy-level: `basicauth` on `@/docs /docs/oauth2-redirect /redoc /openapi.json`
     path matchers only — **not** `/docs/*`, which would also block the user guide.
   - **Acceptance: `curl -k https://mysl-pos.duckdns.org/openapi.json` → 401/404 from
     the internet, while `/docs/user-guide.pdf` stays reachable for POS users.**
3. `[ ]` **Remove the JWT_SECRET fallback**: fail fast at startup if `JWT_SECRET`
   is unset (config.py) instead of falling back to the well-known string. Direct
   `uvicorn` runs without `start.sh` must not boot with a forgeable secret.
4. `[ ]` **Rotate the JWT secret once now** (demo passwords were public knowledge):
   `openssl rand -hex 32` → update `.jwt_secret` → restart. Document the rotation
   procedure in the runbook (it is also the logout kill-switch).
5. `[ ]` **Decide the fate of :8000** — keep only if the "networks that block 443"
   scenario is real; otherwise remove the `:8000` site block from the Caddyfile.

## Phase 2 — Network guardrails (1–2 days)

1. `[ ]` **Firewall (ufw)**: default deny incoming; allow 22, 80, 443 (+8000 only
   if kept). Acceptance: external scan matches the allowlist exactly.
2. `[ ]` **Rate limit + lockout on auth**: rate-limit `POST /auth/login`
    (slowapi, or a Caddy `rate_limit` build) — e.g. 5 failures / 15 min per
    username+IP → 429 + temporary lockout; log failures with username + source IP.
3. `[ ]` **SSH hardening**: password auth off, key-only, fail2ban for sshd.
4. `[ ]` **Caddy access + error logging** with ≥ 30-day retention — the audit
    trail for every edge request.

## Phase 3 — App authn/authz guardrails (2–3 days)

 1. `[ ]` **Authz regression suite**: endpoint × role matrix as CI tests —
    401/403 for unauthenticated/wrong role on every privileged route
    (especially `DELETE /events/{id}`, `POST /admin/backup`, `/users`).
    New routes must fail CI if unguarded (enforced by the matrix test iterating
    `app.routes`).
 2. `[x]` **Token lifetime** already 480 min (8-hour shift) — keep. Document that
    secret rotation is the kill-switch (Phase 1.7).
 3. `[ ]` **Auth audit log**: log login success/failure, password changes, event
    activation/deletion, backup creation (stdout → journald).
 4. `[ ]` Backup path: keep admin-only end-to-end; ZIP never left on shared storage.
 5. `[ ]` Dependency guardrails: `pip-audit` + `npm audit` in CI.

## Phase 4 — Host hardening (1 day)

 1. `[ ]` systemd unit hardening (additive, staged): `NoNewPrivileges=true`,
    `ProtectSystem=strict` + `ReadWritePaths=<repo>`, `ProtectHome=read-only`,
    `PrivateTmp=true`. Verify with `systemd-analyze security` — careful: `start.sh`
    needs uv + repo write access.
 2. `[ ]` File perms: `backend/swap.db*` (incl. `.bak*` copies) → 640; repo not
    world-writable.
 3. `[ ]` Update `docs/runbook.md` with the new guardrails (firewall, rate limit,
    Swagger gating, secret rotation) so future sessions don't undo them.

## Phase 5 — Ongoing verification (recurring)

 1. `[ ]` Quarterly: re-run this audit + authz matrix + `pip-audit`/`npm audit`.
 2. `[ ]` Before each swap event: verify demo creds disabled/rotated, backup
    restore-tested, Caddyfile + ufw unchanged (diff against runbook).

---

## Acceptance criteria (definition of "secured")

- Only 80/443(/8000-if-kept) reachable externally; everything else drops.
- `/docs`, `/openapi.json` not accessible unauthenticated from the internet;
  `/docs/user-guide.pdf|.md` still available to signed-in POS users.
- No default/demo password authenticates.
- Brute-forcing login is impractical (rate-limited + logged + lockout).
- Every privileged endpoint returns 403 for non-admins — proven by CI tests.
- JWT secret rotation documented and rehearsed once.

## Explicitly out of scope (note only)

- MFA (no email/SMS channel for this user base).
- Token revocation lists (rotation + short TTL chosen instead).
- SQLite at-rest encryption (physical access mitigations).
- Square/payment security (integration hidden behind `SQUARE_CARD_ENABLED=false`).
