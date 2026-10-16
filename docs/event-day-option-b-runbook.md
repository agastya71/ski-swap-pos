# Event day — Option B execution runbook (venue Wifi, no router admin)

Decision recorded 2026-10-16: **Option B** — the server joins the venue Wifi
directly; the venue provides no router admin. Full context, the considered
alternatives, and the reasoning live in `docs/event-day-network.md`. This
document is the exact-command version for the day.

---

## 0. What does NOT change on event day

- uvicorn still binds `127.0.0.1:8001` — the app is blind to the IP change
- Caddy config is identical at home and at the venue (hostname-matched)
- the Let's Encrypt cert stays valid (pre-issued); failed renewals are harmless
- label delivery to the Browser-Print workstation is local to that workstation

Only four knobs move: the server's IP, the `ufw` rules, the DuckDNS cron, and
a one-line hosts entry on each staff device.

## 1. At home — days before

1. **Cert expiry check** (user-run):
   `openssl s_client -connect mysl-pos.duckdns.org:443 -servername mysl-pos.duckdns.org 2>/dev/null | openssl x509 -noout -enddate`
   — if it expires within ≈2 weeks of event day, force a renewal at home first.
2. **Record the ufw posture**:
   `sudo ufw status numbered` — note whether 443/8000 are subnet-scoped
   (decides step 2.3 at the venue).
3. **Full DB backup + off-box copy**: `scripts/backup_db.py --quiet`, then copy
   `~/skiswap-backups/` to another device.
4. **Clean shutdown before packing**: `sudo shutdown now`.
5. **On the STANDBY box**: pause its 15-min sync timer for the event window —
   `docs/standby-failover.md` has the exact command; its SSH pulls will fail
   after the move until the primary's IP is known again.

## 2. At the venue — server network attach

1. **Join the venue Wifi; find the server's IP**:
   `ip -4 addr show` — record the `inet` address (e.g. `192.168.0.42/24`).
   If the venue allows a static/reserved lease, pin it; otherwise re-check
   after every reboot or reconnect (venue leases churn).
2. **Note the venue subnet** from the same output (e.g. `192.168.0.0/24`) —
   needed for the ufw rule below.
3. **Firewall** (only if step 1.2 showed ufw active with subnet rules; user-run):
   `sudo ufw allow from <venue-cidr> to any port 443,8000 proto tcp` then
   `sudo ufw status` to confirm.
4. **Stop the DuckDNS cron** (user-run): `crontab -e` → comment the
   `*/5 * * * * ~/duckdns/duck.sh` line → save.
   Why: there is no router admin to forward with, so repointing the public
   record serves nothing — and the flip would break anyone resolving the
   domain via the venue's DNS (they'd get the venue's public IP with no
   hairpin). Hosts-pinned devices (below) are immune either way.
   Restore at home by uncommenting (the record self-corrects within 5 min).

## 3. Staff devices (≈1 min each)

**Preferred — hostname pin: zero cert warnings, ignores the stopped cron:**

- Windows: open Notepad **as administrator** → `C:\Windows\System32\drivers\etc\hosts`
  → add `<venue-ip> mysl-pos.duckdns.org`
- macOS / Linux: `echo "<venue-ip> mysl-pos.duckdns.org" | sudo tee -a /etc/hosts`

**Fallback — LAN-IP:** open `https://<venue-ip>:8000` and accept the browser
warning once (or use `:443`). Same-origin keeps the app and label printing
working after the warning.

## 4. Verification (run from a STAFF device, not the server)

1. hosts-pinned devices: `ping mysl-pos.duckdns.org` answers with the venue IP.
2. `https://mysl-pos.duckdns.org/health` (or `https://<venue-ip>:8000/health`)
   → `{"status":"ok"}`.
3. Admin login works (JWT round-trip through Caddy).
4. Enter/save one intake item (DB write round-trip).
5. Print one label via **Print on server** — scan the barcode.
6. Label workstation: UI opens, agent paired, one test print.
7. A reports page loads (read path through Caddy → uvicorn → SQLite).

## 5. If something goes sideways

| Symptom | Check |
|---|---|
| `/health` unreachable | IP changed? `ip -4 addr show`; ufw? `sudo ufw status`; Caddy up? `systemctl status caddy` |
| Cert warning on a hostname visit | that device's hosts entry is missing or stale |
| App returns 500s | `systemctl status ski-swap-pos` + `sudo journalctl -u ski-swap-pos -n 50` |
| DB write fails | disk space + `sudo journalctl -u ski-swap-pos -n 50` |
| Label print fails | printer transport — `docs/runbook.md` §7 (queue/device/agent) |

## 6. Roll back at home

1. `crontab -e` → uncomment the duck.sh line (or skip: the record
   self-corrects within one cron cycle).
2. `sudo ufw delete <rule-number>` (the venue-subnet rule).
3. Remove the hosts entries from each staff device.
4. Nothing else — the app and Caddy configuration are identical at both sites.