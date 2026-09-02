# Reverse Proxy + HTTPS with Caddy

Runs Caddy in front of the FastAPI app so `https://mysl-pos.duckdns.org`
serves the Ski Swap POS with a real (Let's Encrypt) TLS certificate, auto-renewed.

This is the **direct port-forwarding** path from the hosting spec
([`superpowers/specs/2026-08-16-cloud-hosting-options-design.md`](superpowers/specs/2026-08-16-cloud-hosting-options-design.md)).
It depends on DuckDNS being set up first ([`duckdns-setup.md`](duckdns-setup.md)).

**If you use a tunnel (Cloudflare Tunnel / Tailscale Funnel) instead, you do not
need Caddy or DuckDNS or any port forwarding — skip this doc.**

---

## Prerequisites (already done on this machine)

- ✅ DuckDNS: `mysl-pos.duckdns.org` → router public IP `202.49.186.22`
  (`docs/duckdns-setup.md`)
- ✅ App can run on `127.0.0.1:8001` behind Caddy (Caddy owns 8000)
- ✅ OS: Ubuntu 24.04 (Debian family)

## Machine info used below

| Item | Value (this machine) |
|------|----------------------|
| LAN IP (port-forward target) | `192.168.4.136` — confirm with `ip -4 addr show \| grep inet` |
| Router public IP | `202.49.186.22` |
| Hostname | `mysl-pos.duckdns.org` |
| App bind (behind Caddy) | `127.0.0.1:8001` — Caddy owns ports 80, 443, **and 8000**; the app must NOT be on 8000 |
| Public entries | `https://mysl-pos.duckdns.org` (443) and `https://mysl-pos.duckdns.org:8000` (TLS alternate, for networks that block 443) |

---

## 1. Install Caddy (one sudo command)

```bash
cd ~/code/ski-swap-pos
sudo bash deploy/install-caddy.sh
```

The script adds the official Caddy apt repo, installs Caddy, copies
`deploy/Caddyfile` to `/etc/caddy/Caddyfile`, and starts the `caddy` systemd
service (binds `:80`, `:443`, and `:8000`).

The `Caddyfile` is:

```caddy
mysl-pos.duckdns.org {
    reverse_proxy 127.0.0.1:8001
}

# TLS alternate entry on port 8000 (same Let's Encrypt cert as :443)
https://mysl-pos.duckdns.org:8000 {
    reverse_proxy 127.0.0.1:8001
}
```

Caddy automatically obtains and renews the Let's Encrypt certificate for
`mysl-pos.duckdns.org` the first time it receives a request on port 443; the same
cert is also served on port 8000.

## 2. Make sure the app is running

The app must be up on `127.0.0.1:8001` **behind Caddy** (Caddy now owns port
8000, so the app must use a different internal port). `start.sh` accepts
`APP_HOST` / `APP_PORT` env vars:

```bash
cd ~/code/ski-swap-pos
APP_HOST=127.0.0.1 APP_PORT=8001 JWT_SECRET="$(openssl rand -hex 32)" bash start.sh
```

Binding to `127.0.0.1` means only Caddy (on the same host) can reach the app —
nothing is exposed on the LAN directly. `JWT_SECRET` should be a real secret
before opening to the internet (see Security notes).

> For the LAN-direct / no-Caddy path (e.g. event day on venue WiFi with no
> internet), the defaults still apply: `bash start.sh` binds `0.0.0.0:8000` as
> before. See `docs/setup-new-machine.md` §9–11.

## 3. Forward ports on the router (manual, only you can do this)

On your router's admin page, forward **all three**:

| External | → | Internal |
|----------|---|----------|
| TCP 80 | → | `192.168.4.136:80` |
| TCP 443 | → | `192.168.4.136:443` |
| TCP 8000 | → | `192.168.4.136:8000` |

Port 80 is required for the Let's Encrypt HTTP-01 challenge (then Caddy
redirects to 443). Port 443 is the primary HTTPS endpoint. Port **8000** is a
**TLS alternate** entry — same cert, served over HTTPS — for networks that block
443. Reach it with the `https://` scheme: `https://mysl-pos.duckdns.org:8000`.

## 4. Verify

From any device (including a phone on cellular, to avoid LAN shortcuts):

```bash
curl -I https://mysl-pos.duckdns.org/health            # expect HTTP/2 200 (primary TLS)
curl -I https://mysl-pos.duckdns.org:8000/health       # expect HTTP/2 200 (TLS alternate)

# then open in a browser:
#   https://mysl-pos.duckdns.org
# login: admin / admin123  (change before event day)
```

If the cert isn't issued yet, watch Caddy's logs:

```bash
sudo journalctl -u caddy -f
# look for: certificate obtained successfully  (or an ACME error)
```

---

## Security notes

- **Change the default passwords.** `admin/admin123`, `intake1/intake123`,
  `cashier1/cashier123` are seeded by `seed_demo.py` and are public in the repo.
- The Swagger docs at `/docs` and `/openapi.json` will be **publicly exposed**
  once the port is open. To restrict them, uncomment the `basicauth` blocks in
  `deploy/Caddyfile` and generate a hash with `caddy hash-password`, then
  `sudo systemctl reload caddy`.
- This app has **no rate limiting**. Caddy in front provides some protection;
  consider `sudo ufw limit 443` for SSH-style throttling isn't applicable here,
  but Caddy's built-in handling is generally enough for the expected load.
- The `JWT_SECRET` defaults to `change-me-before-event-day` in
  `backend/app/config.py`. **Set a real secret** before exposing publicly — the
  run command in §2 already passes one via `JWT_SECRET="$(openssl rand -hex 32)"`.
- **Port 8000 is HTTPS** (TLS, same Let's Encrypt cert as 443) — there is **no
  plaintext entry** to the app. Clients must use the `https://` scheme on 8000:
  `https://mysl-pos.duckdns.org:8000`. (Typing `http://…:8000` will not connect.)
  This keeps the alternate-port fallback useful even on networks that block 443.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Browser says "can't reach" / timeout | Router port forwarding not set, or LAN IP wrong. Confirm `192.168.4.136` is still this machine's IP. |
| Caddy log: "no certificate available" / ACME error | Port 80 not reachable from the internet (HTTP-01 challenge). Confirm the forward and that no ISP blocks 80. |
| Caddy log: `502` from upstream | App not running on `127.0.0.1:8001`. `curl -s http://127.0.0.1:8001/health` should return `{"status":"ok"}`. |
| DuckDNS hostname points to wrong IP | `cat ~/duckdns/duck.log` should be `OK`; wait 5 min for the cron update. |
| `caddy validate` fails | Caddyfile syntax — check tabs/spaces; re-run `sudo bash deploy/install-caddy.sh`. |

## Files installed by this setup

| Path | Purpose |
|------|---------|
| `deploy/Caddyfile` | Caddy config: `mysl-pos.duckdns.org` (443) + `https://…:8000` (TLS alt) → `127.0.0.1:8001`, plus optional `basicauth`. |
| `deploy/install-caddy.sh` | One-shot installer (run with sudo). |
| `/etc/caddy/Caddyfile` | Installed copy (managed by the script). |
| `caddy` systemd service | Auto-starts on boot, binds :80 + :443 + :8000. |

## Reference

- Caddy install (Ubuntu): <https://caddyserver.com/docs/install#debian-ubuntu-raspbian>
- DuckDNS setup: `docs/duckdns-setup.md`
- Hosting spec: `docs/superpowers/specs/2026-08-16-cloud-hosting-options-design.md`