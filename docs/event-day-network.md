# Event-day network relocation plan

The POS server (PRIMARY, `192.168.4.136` at home) travels to a venue and joins
a new Wifi — it arrives with a **new LAN IP and a new WAN context**. This plan
makes that a non-event. Written 2026-10-16; pairs with `docs/runbook.md` (§7
labels) and `docs/standby-failover.md`.

---

## 1. What actually breaks when the box moves (and what doesn't)

| Component | Survives transport? | Why |
|---|---|---|
| uvicorn app (binds `127.0.0.1:8001`) | YES — untouched | loopback binding ignores the IP entirely |
| Caddy reverse proxy (443/80/8000) | YES — untouched | site blocks match by hostname (SNI), not by IP; listens on all interfaces |
| TLS certificate | YES — day-of | already issued for `mysl-pos.duckdns.org`, valid ~90 days; no re-issuance needed at the venue |
| DuckDNS record (`mysl-pos.duckdns.org`) | CHANGES | cron `*/5 * * * * ~/duckdns/duck.sh` repoints the domain to whatever egress IP the new network provides, within 5 min |
| Clients reaching the app | **THE PROBLEM** | they must (a) resolve the name to the box's venue IP and (b) be routed to it — venue DNS/HTTP won't do either by itself |
| Label printing (Browser-Print workstation) | YES — once the UI is reachable | the page talks to the agent **on the workstation itself** (localhost bridge); server IP is irrelevant to printer delivery |
| Standby sync (`192.168.4.21`, 15-min timer) | breaks harmlessly | SSH target unreachable → failure noise; pause it for the day (§5) |

**One-sentence form: the app and its front door (Caddy + cert) are
IP-agnostic; only name resolution + routing need a move-day answer.**

> **DECISION (2026-10-16): Option B — server joins the venue Wifi directly.
> The venue will not provide router admin**, so: staff devices reach the box
> via a per-device hostname pin (hosts file) or the LAN-IP with one accepted
> browser warning; the DuckDNS cron is stopped for the event window (no
> forward is possible, so flipping the public record serves nothing); the
> `ufw` venue-subnet rule is added on arrival. Option A below remains
> documented for reconsideration (e.g. a future event with venue admin).

---

## 2. Option A (considered — NOT chosen) — bring a travel router, clone the home subnet

A ~$30 travel router (GL.iNet etc.) configured **at home, tested once**.
Server + workstations join ITS network; its WAN uplinks to the venue Wifi (or
a phone hotspot). The venue network becomes just an uplink — nothing inside
changes.

### One-time setup (at home)

1. LAN = `192.168.4.0/24` (same subnet as home) → the server's existing
   expectation holds; any hardcoded/remembered `192.168.4.x` still works.
2. DHCP/static lease: server MAC → `192.168.4.136` (same IP forever).
3. DNS override on the router (GL.iNet custom DNS rule / dnsmasq):
   `address=/mysl-pos.duckdns.org/192.168.4.136` — the domain resolves to the
   box **even fully offline**.
4. DHCP for staff devices: enable + give them the router as DNS.

### Why this wins

| Aspect | Travel router (A) | Venue Wifi direct (C) |
|---|---|---|
| App/config changes | none | none, but per-device workarounds |
| Cert warnings on staff devices | none | browser warning per device |
| Works with zero venue internet | yes | yes, via IP + warnings |
| IP stability on reconnects | static lease = fixed | unknown, churns per lease |
| Day-of complexity | plug in 2 cables | discovery + hosts edits + ufw |
| Needs venue router admin | no | no (but helpful) |

### Event-day procedure (A)

1. Power the travel router; WAN joins the venue Wifi (or hotspot).
2. Server in on ethernet cable → holds `192.168.4.136`.
3. Staff devices join the travel SSID.
4. Verify (§4). Nothing else.

---

## 3. Option B (CHOSEN) — server joins the venue Wifi directly

Use when no travel router. Accept rougher edges; staff devices are few.

1. **Discover the box's venue IP** (venue router admin panel, or from the
   server: `ip -4 addr show` / `nmcli -f DEVICE,IP4.ADDRESS device show`).
2. **Pin it** if venue admin allows a reservation; otherwise note that the IP
   can churn across reconnects and re-check after any power event.
3. **Choose the reachability model:**
   - **3a. LAN-IP + accepted warning** — clients open
     `https://<venue-ip>:8000` (or `:443`), proceed through the browser cert
     warning once. The existing cert is for the domain, so an IP visit always
     warns; for 2–3 staff devices this is the zero-setup path. Same-origin
     rules keep the app + label printing working after the warning.
   - **3b. hosts-file pin** — on each staff device, map
     `mysl-pos.duckdns.org` → venue IP; then the real hostname + existing cert
     work with **no warnings**: Windows (admin Notepad →
     `C:\Windows\System32\drivers\etc\hosts`), macOS/Linux:
     `echo "<ip> mysl-pos.duckdns.org" | sudo tee -a /etc/hosts`.
   - **3c. Venue router admin** (if someone hands you the panel): port-forward
     `443/8000` TCP → venue-IP, then the domain (flipped by the DuckDNS cron)
     works for anyone on the internet — **and locally only via hairpin**,
     which consumer/venue routers usually lack. Prefer 3b locally even if 3c
     is available.
4. **DuckDNS cron — STOP for the event window (decided):** with no router
   admin there is nothing to forward to, so repointing the public record
   serves nothing — and the flip would break locally-resolved-domain clients
   (they'd get the venue's public IP with no hairpin). `crontab -e` → comment
   the `~/duckdns/duck.sh` line → uncomment at home. Staff devices are covered
   by the hosts pin from step 3b regardless.
5. **Firewall:** if `ufw` scopes 443/8000 to the home subnet, allow the venue
   subnet (user-run): `sudo ufw allow from <venue-cidr> to any port 443,8000
   proto tcp` — see the pre-flight check below.

---

## 4. Verification checklist (runs from a STAFF device, not the server)

1. `nslookup mysl-pos.duckdns.org` → resolves to the server's IP on this network.
2. `https://mysl-pos.duckdns.org/health` (or `https://<venue-ip>:8000/health`)
   → `{"status":"ok"}`.
3. Login works (admin) — JWT round-trip through Caddy.
4. Seller intake + one item entry save (DB write round-trip).
5. Print one label (Print on server) — scanner reads the code.
6. Label workstation (agent): UI opens, agent paired, one test print.
7. Reports page loads (readpath through Caddy → uvicorn → SQLite).

---

## 5. Pre-flight (at home, days before) + transport hygiene

1. `openssl s_client -connect mysl-pos.duckdns.org:443 -servername
   mysl-pos.duckdns.org 2>/dev/null | openssl x509 -noout -enddate` — if the
   cert expires within ~2 weeks of event day, force a renewal at home first.
2. `sudo ufw status numbered` — record whether 443/8000 are subnet-scoped.
3. Option A only: configure + TEST the travel router end-to-end at home
   (server through it, `/health` from a laptop, one label print).
4. Full DB backup: `bash` the backup script / `scripts/backup_db.py --quiet`
   — copy `~/skiswap-backups/` off-box.
5. Clean shutdown (`sudo shutdown now`) before packing — no abrupt power cut.
6. On the STANDBY box: stop its 15-min sync timer for the event window
   (`systemctl --user stop …` / disable per `docs/standby-failover.md`) — its
   SSH pulls will fail after the move until the primary's IP is known again.
7. At the venue: server and workstations on the SAME network segment (or a
   routed path) — the runbook's one-active rule still applies.

## 6. Roll back home

- Option A: power down the travel router; reconnect everything at home; zero
  app changes to undo.
- Option B: uncomment the DuckDNS cron (or let it self-correct within 5 min),
  `sudo ufw delete <venue rule>`, remove per-device hosts lines.