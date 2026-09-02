# Cloud Hosting Options — Design Specification

**Date:** 2026-08-16
**Status:** Proposed (awaiting stakeholder decision)

**Hardware confirmed:** Zebra ZD421 **USB** model (not the WiFi/Ethernet
ZD421W/ZD421e). This constrains every remote-printing option — see §2.

---

## Overview

The app is currently a **local-network application**: one laptop runs the server,
4–5 POS stations connect over venue WiFi, a USB Zebra ZD421 prints labels, and a
SQLite file holds the event data. The original design spec (`2026-04-03-ski-swap-pos-design.md` §13) explicitly listed "Online/cloud deployment" as out of scope for v1.

This spec evaluates simpler paths to hosting the app for a not-for-profit (NPO)
operator, ranks them by effort, and proposes the smallest set of code changes
needed for each. **No code changes are made by this spec** — it is a decision
document. Implementation is tracked separately once a path is chosen.

---

## 1. Remote access vs permanent hosting

The options below fall into two fundamentally different categories. Deciding
which category the NPO wants comes **before** picking a specific option.

### Remote access (the app stays on the event laptop)

The app **still runs on the event laptop**, exactly as it does today. A tunnel
(Cloudflare Tunnel or Tailscale Funnel) just gives that laptop a public HTTPS
URL so people can reach it from outside the venue.

- Event day: laptop on the venue desk, printer and Square reader plugged in,
  `start.sh` running. POS stations connect over venue WiFi. Today's setup,
  unchanged.
- Two days before the event: the treasurer, at home, opens
  `https://skiswap.yourorg.org` to pre-load sellers and items. The laptop at the
  venue is on and online (or someone turns it on for a few hours).
- After the event: someone turns the laptop on at the office and runs end-of-day
  reports; leadership browses the same URL to see the numbers.

Key properties: the laptop **is** the server (no server exists when it is off);
if the laptop crashes or its WiFi drops the app goes down for everyone;
data lives in `swap.db` on that laptop's disk (backups are whatever you remember
to copy off); the printer and Square reader work exactly as today; cost ~$0;
effort ~30 min; no code changes. The honest description is **"cloud-reachable,"
not "cloud-hosted"** — the cloud provides only a stable public address and TLS.

### Permanent hosting (the app runs in a data centre)

The app runs on a **server in a data centre** (a rented VM or a PaaS like
Fly.io/Render) that is always on, with backup power and network redundancy.
The laptop is no longer the server — it is just another client, or retired.

- Event day: POS stations at the venue browse `https://skiswap.yourorg.org`,
  hitting the data-centre server. The venue only needs internet access.
- The USB printer, on the intake desk, can't be reached directly by the
  data-centre server — so you run the §4 `socat` TCP→USB relay on the intake
  laptop and point `LABEL_PRINTER_HOST` at it (see §4).
- At 3am any day: the server is up; reports, admin, data entry all available.
- Backups: a cron job dumps the SQLite file to object storage nightly — no human
  has to remember.
- If the venue's internet drops on event day: POS stations lose the server (same
  as today if the laptop died), but the server and all data are safe in the data
  centre.

Key properties: always on, independent of any laptop or venue; data lives on
the server disk with automated backups; the single point of failure shifts from
"one laptop at a venue" to "one small VM" (provider-managed, more reliable,
backed up); you now own a server — someone patches it and watches backups
(light, real sysadmin work); cost ~$5–12/mo (often $0 with NPO credits); the USB
printer needs the §4 relay (or a future networked-Zebra upgrade).

### Practical comparison

| | Remote access (Option 1) | Permanent hosting (Options 2 & 3) |
|---|---|---|
| Runs on | Event laptop | Data-centre server (always on) |
| Available when laptop is off | No | Yes |
| Data lives on | The laptop's disk | Server disk + automated backups |
| Backup discipline | Manual (copy the .db file) | Automated nightly |
| Single point of failure | The laptop (power, WiFi, crash) | The VM (provider-managed, more reliable) |
| Printer works | As today (plugged into laptop) | Needs the `socat` relay on intake laptop |
| Event day needs venue internet? | No (laptop is the server) | Yes (stations must reach the data centre) |
| Sysadmin work | None | Light, ongoing |
| Cost | Free | ~$5–12/mo (often free via NPO credits) |
| Setup effort | ~30 min | A few hours |

### How to tell which one you want

Pick **remote access** if the real need is any of:
- Board members / volunteers want to use the admin panel from home before or
  after the event.
- You don't want to manage a server.
- Event day must not depend on the venue having internet (the laptop-as-server
  model is a feature here — it works with no upstream internet).

Pick **permanent hosting** if the real need is any of:
- You keep losing data when a laptop dies / gets wiped / gets replaced.
- You want one permanent home for the data that isn't tied to a specific
  volunteer's laptop.
- You want automated backups and an always-on URL to hand to leadership.
- Multiple events / chapters want to share one installation.

**One nuance worth flagging:** event-day internet dependency flips. Today, if
the venue's internet is down, the POS still works (everything is on the laptop
over LAN). Under permanent hosting, if the venue's upstream internet is down,
the POS is down — even though the server is fine in the data centre. For a
ski-swap at a venue with flaky WiFi, that is a real consideration and an
argument for Option 1 or for keeping a local fallback.

---

## 2. The one unavoidable tradeoff

Moving the backend off the intake desk breaks **USB label printing**.
`send_to_printer()` in `backend/app/services/zpl.py` writes ZPL to either
`/dev/usb/lp*` (Linux) or the pyusb USB endpoint (macOS). Neither works when the
printer is on a desk and the server is in a data centre. **The confirmed printer
is the USB model**, so it cannot be reached directly over the network.

Every "real cloud" option (Options 2 & 3 below) must resolve this. The resolution
options, given USB-only hardware:

| Approach | Effort | Notes |
|----------|--------|-------|
| **TCP→USB relay on the intake laptop** (e.g. `socat TCP-LISTEN:9100,reuseaddr,fork OPEN:/dev/usb/lp0`) + cloud server sends ZPL over TCP 9100 to the relay | Small — one function in `zpl.py` + one relay command on the laptop | Reuses the §4 TCP code unchanged; `LABEL_PRINTER_HOST` points at the relay laptop. Printer stays USB-attached where it works. |
| Replace printer with a networked Zebra (ZD421W/ZD421e) + send ZPL over TCP 9100 directly | Hardware purchase + one function in `zpl.py` | Same §4 code; `LABEL_PRINTER_HOST` points at the printer's IP |
| Keep an "intake laptop" as a full print relay (custom service) | More moving parts | Custom relay service instead of a one-line `socat` |
| Move ZPL rendering into the browser (client-side print) | Large redesign | Breaks the server-side-label model the app is built around |

**The TCP→USB `socat` relay is the key enabler for the current USB printer.** It
is one command on the intake laptop and uses the same §4 code path as a
networked Zebra — `send_to_printer()` just opens a TCP socket to the relay host
instead of a `/dev/usb/lp*` file. The relay writes the bytes to the USB device.
For security, the relay should only be reachable over a private network
(Tailscale) or bound to the venue LAN — never exposed to the public internet.

Option 1 (tunnel) sidesteps all of this — the printer stays attached to the
laptop, which is still the server.

---

## 3. Options ranked by simplicity

### Option 1 — Tunnel the existing laptop to the internet

Run the app exactly as documented in `docs/setup-new-machine.md`, then expose it
through a tunnel for a public HTTPS URL. **Zero code changes, zero migration.**

- **Cloudflare Tunnel** (`cloudflared`) — free, auto-TLS, no port forwarding.
- **Tailscale Funnel** — same model, free for small use.

**Pros:** printer and Square reader stay attached where they work; SQLite stays;
setup is what the setup guide already says, plus one tunnel command; lowest
ops burden.

**Cons:** only up when the laptop is on; laptop is a single point of failure;
"cloud-reachable," not truly hosted.

**Best for:** NPO that wants board/volunteers to reach the app from home or to
avoid running a server, while event day still runs on the venue laptop.

### Option 2 — One small VPS, run the app as-is

Rent a $5–12/mo Linux VPS (Hetzner, DigitalOcean, AWS Lightsail, Fly.io) and run
the repo with `start.sh` behind **Caddy** for automatic HTTPS. **Keep SQLite.**
No Postgres, no Docker required (Docker optional for convenience).

- Backups = cron job copying the `.db` file to object storage.
- `JWT_SECRET` must be set to a real secret (not the `change-me-before-event-day` default).
- Printer: run the **§4 TCP→USB `socat` relay** on the intake laptop; set
  `LABEL_PRINTER_HOST=<relay-laptop-ip>`. (Or replace the printer with a
  networked Zebra.)

**Pros:** genuinely hosted and always-on; one place to back up; Caddy handles
TLS/renwals automatically; cheap; NPO credits can cover it.

**Cons:** you run a server (patching, backups); printer needs the §4 TCP code
change + the `socat` relay.

**Best for:** NPO that wants a permanent, backed-up home for the app and is
willing to do light sysadmin work (or have a volunteer do it).

### Option 3 — PaaS (Fly.io or Render)

Platform runs the app from a small Dockerfile, provides HTTPS, domain, git-push
deploys, and a **persistent volume** so SQLite keeps working without Postgres.
Fly.io especially supports single-machine + persistent volume + SQLite.

- Write one ~15-line `Dockerfile`.
- No reverse-proxy or TLS config — the platform does it.
- Printer: same §4 TCP→USB relay as Option 2 (or a networked Zebra).

**Pros:** less ops than a raw VPS (managed deploys, logs, TLS); free/cheap
tiers; NPO-credit-friendly.

**Cons:** slightly more setup than Options 1–2 (Dockerfile, volume config);
still need to solve labels.

**Best for:** NPO with a volunteer who is comfortable with Docker but doesn't
want to babysit a VM.

### Option 4 — Host only the data, not the server

Keep event-day on the laptop (as designed). After the event, push the SQLite
file to cloud storage for archival / reporting / dashboards. No app hosting at
all.

**Pros:** cheapest and simplest; zero architecture change.

**Cons:** the POS itself is not internet-accessible.

**Best for:** NPO whose real ask is "leadership wants to see the data afterward,"
not "run the POS over the internet."

---

## 4. Proposed code change — TCP print path (enables Options 2 & 3)

`send_to_printer()` in `backend/app/services/zpl.py` currently branches on
platform: macOS → pyusb, Linux → `/dev/usb/lp*` file. Add a **TCP 9100** path
selected by a new env var `LABEL_PRINTER_HOST`. When set, ZPL is sent over a
raw TCP socket to that host — which is either a **networked Zebra** (if you
upgrade hardware) or a **TCP→USB relay on the intake laptop** (the confirmed
USB-printer path). In both cases the code is identical. When unset, behaviour
is unchanged (existing USB paths preserved).

```python
import socket
import sys
from app.config import LABEL_PRINTER_HOST, LABEL_PRINTER_PATH

_PRINT_WIDTH = 812
_ZEBRA_VID   = 0x0A5F
_ZEBRA_PID   = 0x0185
_PRINT_PORT  = 9100   # Zebra raw-print TCP port


def send_to_printer(zpl: str, printer_path: str = LABEL_PRINTER_PATH) -> None:
    """Send ZPL to the printer.

    Resolution order:
      1. LABEL_PRINTER_HOST set  → raw TCP 9100 to a networked Zebra (any OS)
      2. macOS                   → pyusb direct USB
      3. Linux/other             → write to device file (e.g. /dev/usb/lp0)
    """
    if LABEL_PRINTER_HOST:
        _send_tcp(zpl, LABEL_PRINTER_HOST)
    elif sys.platform == "darwin":
        _send_usb(zpl)
    else:
        with open(printer_path, "wb") as f:
            f.write(zpl.encode("utf-8"))


def _send_tcp(zpl: str, host: str, port: int = _PRINT_PORT) -> None:
    """Send ZPL raw to a networked Zebra over TCP 9100."""
    data = zpl.encode("utf-8")
    with socket.create_connection((host, port), timeout=5) as sock:
        sock.sendall(data)
```

`backend/app/config.py` gains:

```python
LABEL_PRINTER_HOST: str = os.getenv("LABEL_PRINTER_HOST", "")  # empty = use USB path
```

**Relay setup (for the USB printer + cloud server):** on the intake laptop, with
the printer at `/dev/usb/lp0`, run one command (or as a systemd unit):

```bash
# Only listen on the venue LAN / Tailscale interface — never 0.0.0.0 to the open internet
socat TCP-LISTEN:9100,reuseaddr,bind=10.0.0.5,fork OPEN:/dev/usb/lp0
```
Then on the cloud server: `LABEL_PRINTER_HOST=10.0.0.5` (the relay laptop's
address, reachable over Tailscale or the venue LAN). The §4 TCP path writes
ZPL to that socket; `socat` forwards it to `/dev/usb/lp0`. No custom relay code.

**Why this is safe to merge regardless of the hosting decision:** it's purely
additive. The default (`LABEL_PRINTER_HOST=""`) preserves today's USB behaviour
bit-for-bit, so the existing Linux printer investigation (see
`docs/superpowers/plans/2026-05-10-linux-printer-empty-labels.md`) is unaffected.
The TCP path can be deployed independently of any cloud move — even Option 1
(tunnel) can use it later if you ever want printing to reach a second venue
printer, without changing server code again.

**Tests to add** in `backend/tests/test_zpl.py`:
- `send_to_printer` calls `_send_tcp` when `LABEL_PRINTER_HOST` is set (mock
  `socket.create_connection`).
- `send_to_printer` falls through to the file/USB path when `LABEL_PRINTER_HOST`
  is empty (existing tests already cover this via the endpoint mocks).

---

## 5. NPO cost / credits

| Option | Typical cost | NPO angle |
|--------|--------------|-----------|
| 1 — Tunnel | Free (Cloudflare/Tailscale) | No NPO program needed |
| 2 — VPS | $5–12/mo | AWS Promotional Credits for Nonprofits, Azure AI for Good, Google Cloud for Nonprofits; Hetzner has no formal program but is cheap |
| 3 — PaaS | Free tier → ~$5/mo | Fly.io/Render free tiers; NPO cloud credits apply |
| 4 — Data only | ~$0 (object storage) | Same credits |

A custom domain is ~$10–15/yr (or free via some NPO domain programs).

---

## 6. Recommendation

With the **USB printer** confirmed:

- **Default recommendation: Option 1 (Cloudflare Tunnel).** It's the only option
  that needs **zero** changes to printing and ~30 min of total work. The printer
  and Square reader stay attached to the laptop, which is still the server.
  This is the right answer unless the NPO specifically needs always-on hosting.
- **If the need is genuinely always-on hosting** → **Option 2 (small VPS + Caddy +
  SQLite)** + the §4 TCP code change + a **`socat` TCP→USB relay on the intake
  laptop** (`LABEL_PRINTER_HOST=<relay-ip>`). This keeps the current USB printer
  working with no hardware purchase and no custom relay code. Avoid Postgres and
  Docker unless there's a concrete reason.
- Only consider replacing the printer with a networked Zebra if the relay laptop
  is itself a problem (e.g. no machine can stay on at the intake desk).

Either can be combined with Option 4 for post-event data archival.

---

## 7. Out of scope for this spec

- Postgres migration (only needed if SQLite-on-one-file stops being viable —
  not the case at this load).
- Docker/Kubernetes orchestration.
- Multi-instance horizontal scaling (a single instance handles this load with
  enormous headroom).
- Moving credit-card processing off the server station (Square wiring is
  unaffected by these options — it's browser-side + server-side recording).
- Non-profit accounting/compliance reports (still flagged out of scope per the
  original design spec §13; to be defined with MYSL stakeholders).

---

## 8. Open questions for stakeholders

1. Is the goal **remote access** (volunteers/board reach the app away from the
   venue) or **permanent hosting** (a real server in a data centre)? This
   decides between Option 1 and Options 2 & 3 — see §1 for the distinction.
2. ~~Is the event-day Zebra the USB or WiFi/Ethernet model?~~ **Answered: USB.**
   Options 2 & 3 therefore need the §4 TCP code + a `socat` relay on the intake
   laptop (or a future printer upgrade to a networked model).
3. Is there an NPO cloud credit account already (Google/AWS/Azure)? Sets the
   cost basis.
4. Who operates the server if Option 2 or 3 is chosen (a volunteer, a paid
   sysadmin, a board member)?