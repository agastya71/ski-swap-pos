# DuckDNS — Dynamic DNS setup

Gives this machine a stable hostname (`<subdomain>.duckdns.org`) that tracks its
router's public IP. Updated every 5 minutes by a cron job.

> **When you actually need this:** DuckDNS provides **DNS only** — a hostname
> pointing at your router's public IP. It does **not** route traffic to the
> machine or provide HTTPS. See [§ How this fits the hosting plan](#how-this-fits-the-hosting-plan)
> below before relying on it.

Tested on this machine: Linux (Ubuntu/Debian base), cron running, curl 8.5.
Public IP at time of writing: `202.49.186.22` (belongs to the router, not the box).

---

## 1. Get a subdomain + token

1. Open <https://www.duckdns.org/> and sign in (Google / GitHub / Reddit / Microsoft).
2. Type a subdomain (e.g. `myskiswap`) and click **add domain**. You now own
   `myskiswap.duckdns.org`.
3. Copy the **token** (the long UUID at the top of the dashboard). It's the same
   token for all your subdomains. Keep it private — it can update any of your
   DuckDNS domains.

## 2. Put them in the updater script

The script lives at `~/duckdns/duck.sh` (created once already). Edit it:

```bash
nano ~/duckdns/duck.sh
```

Set the two values (subdomain only — no `.duckdns.org`, no spaces):

```sh
DOMAINS="myskiswap"
TOKEN="a7c4d0ad-114e-40ef-ba1d-d217904a50f2"
```

For multiple subdomains: `DOMAINS="myskiswap,myskiswap2"` (comma-separated, no spaces).

The full script for reference:

```sh
#!/bin/sh
DOMAINS="YOUR_SUBDOMAIN"
TOKEN="YOUR_TOKEN"
echo url="https://www.duckdns.org/update?domains=${DOMAINS}&token=${TOKEN}&ip=" | curl -k -o ~/duckdns/duck.log -K -
```

## 3. Test

```bash
~/duckdns/duck.sh          # returns to a prompt, no output
cat ~/duckdns/duck.log     # should print "OK"  (KO = token/domain wrong)
```

Verify the hostname resolves (allow ~1 min for DNS propagation):

```bash
nslookup myskiswap.duckdns.org
# expect: resolves to this machine's public IP (e.g. 202.49.186.22)
```

## 4. Schedule the update every 5 minutes

```bash
crontab -e
```
(First run asks you to pick an editor — choose `nano` if unsure.)

Paste at the bottom, save (Ctrl+O, Enter), exit (Ctrl+X):

```
*/5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1
```

Confirm:

```bash
crontab -l
```

Done. The cron job pings DuckDNS every 5 minutes; if the router's public IP
changes (ISP reassignment, reboot), the hostname updates within 5 minutes.

---

## Files installed

| Path | Purpose |
|------|---------|
| `~/duckdns/duck.sh` | Updater script (chmod 700). Edit with your token + subdomain. |
| `~/duckdns/duck.log` | Last update response (`OK` / `KO`). Created on first run. |
| `crontab` (user) | `*/5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1` |

---

## How this fits the hosting plan

DuckDNS is **DNS only**. It gives you a name; it does not expose the app or
provide TLS. Whether you need it at all depends on which option from
[`docs/superpowers/specs/2026-08-16-cloud-hosting-options-design.md`](superpowers/specs/2026-08-16-cloud-hosting-options-design.md)
you pick:

| Hosting approach | Need DuckDNS? | Why |
|------------------|---------------|-----|
| **Option 1 via Cloudflare Tunnel** | **No** | The tunnel provides its own public HTTPS URL (`*.trycloudflare.com` or your own domain via Cloudflare) and handles routing + TLS. DuckDNS adds nothing. |
| **Option 1 via Tailscale Funnel** | **No** | Funnel gives a `*.ts.net` HTTPS URL. |
| **Option 2/3 — direct self-hosting (port forwarding)** | **Yes** | You expose the app on the router's public IP via port forwarding; DuckDNS gives that IP a stable hostname. You still need Caddy in front of uvicorn for HTTPS. |
| **Tailscale (private network, not Funnel)** | Optional | Tailscale already gives `*.ts.net` device names; DuckDNS only helps if you want a memorable public-style name. |

### If you do use DuckDNS with direct port forwarding

1. Find this machine's **LAN** IP: `ip -4 addr show | grep inet` (the
   `192.168.x.x` / `10.x.x.x` address).
2. On the router, forward external port **80 + 443** → that LAN IP.
3. Run the app bound to all interfaces (the setup doc's `start.sh` already uses
   `--host 0.0.0.0`): `bash start.sh`.
4. Put **Caddy** in front of uvicorn for automatic HTTPS, with a Caddyfile:
   ```
   myskiswap.duckdns.org {
       reverse_proxy 127.0.0.1:8000
   }
   ```
   Caddy obtains and renews the Let's Encrypt cert for the DuckDNS hostname
   automatically (it uses DuckDNS's `update` endpoint via a DNS-01 plugin, or
   HTTP-01 over the forwarded port 80).

> **Note on the app's bind address:** the dev server in this repo was started on
> `127.0.0.1:8000` during testing — that is **not** reachable from other
> machines. For any remote access, run via `start.sh` (or `uvicorn ... --host
> 0.0.0.0`), which the setup doc already documents.

---

## Security notes

- The **token** can update any of your DuckDNS domains. Don't commit it to git
  or paste it in public chats. `~/duckdns/duck.sh` is `chmod 700` (owner-only).
- DuckDNS hostnames are **public** — anyone who knows `myskiswap.duckdns.org`
  can resolve your router's public IP. That's expected; it's not a secret.
- This app has **no rate limiting or brute-force protection** beyond JWT auth.
  If you expose it directly to the internet (port forwarding), put it behind
  Caddy and consider restricting `/docs` and admin endpoints, or only allow
  access over Tailscale. A tunnel (Cloudflare/Tailscale) avoids exposing the
  port at all and is the safer default.

---

## ⚠ VPN gotcha (NordVPN / WireGuard / OpenVPN on the host)

If a VPN runs on this machine, two things break inbound hosting:

1. **The DuckDNS updater repoints the hostname at the VPN exit IP**, not the
   router's real WAN IP — so the public hostname resolves to a VPN server that
   will never forward to you. (On 2026-08-17, `mysl-pos.duckdns.org` drifted to
   `202.49.186.22`, a NordVPN exit, while the router's real WAN IP was
   `72.50.207.152`. Every external connection timed out until DuckDNS was
   repointed.)
2. **The VPN's firewall drops inbound connections** to Caddy (80/443/8000)
   even when the VPN is not the default route.

**Mitigations (both applied on this machine):**

- `~/duckdns/duck.sh` binds curl to the default-route interface
  (`--interface <iface>`) so IP detection always sees the real router IP, even
  if a VPN is active. (This curl build rejects `--interface=NAME`; use the space
  form `--interface NAME`.)
- **Operational rule: keep NordVPN disconnected while serving the POS publicly.**
  `nordvpn disconnect` before event day; verify with `nordvpn status` →
  Disconnected and `ip -br link show nordlynx` → absent.

## How to tell which IP DuckDNS is pointing at

```bash
dig +short @1.1.1.1 mysl-pos.duckdns.org          # what the world sees
curl -s https://api.ipify.org; echo               # what this machine reports
# the router's WAN IP is on the router admin page (http://192.168.4.1 → WAN/Status)
```

The DuckDNS record should match the router's WAN IP — not a VPN exit address.

---

## Troubleshooting

- `cat ~/duckdns/duck.log` → `KO`: token or subdomain is wrong in `duck.sh`.
- `duck.log` says `OK` but `nslookup` still shows an old IP: DNS caching — wait
  a few minutes, or try `dig @1.1.1.1 myskiswap.duckdns.org`.
- Cron not running: `ps -ef | grep cr[o]n` should show `cron`. On a fresh boot
  it starts automatically on Ubuntu/Debian.
- Hostname points to a private IP (e.g. `192.168.x.x`): you're behind a NAT that
  is rewriting the `&ip=` detection. Leave `ip=` empty (as the script does) so
  DuckDNS detects your public IP from the request itself.

---

## Reference

- Official guide: <https://www.duckdns.org/install.jsp> (linux cron section)
- Source spec: `docs/superpowers/specs/2026-08-16-cloud-hosting-options-design.md`