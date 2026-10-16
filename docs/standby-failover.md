# Ski Swap POS — primary & standby runbook

Operational instructions for both servers. Read §1 to know which machine you
are on; every command below is labelled with where it runs.

- **PRIMARY** — `ramdev-wudali@192.168.4.136` — serves live traffic
- **STANDBY** — `agastya71@ramdev-MacBookPro2`, `192.168.4.21` (wired) — cold
  standby: keeps a synced copy of the databases, app stays stopped until failover

*Set up / last revised 2026-10-16.*

---

## 1. Topology & identities

```
mysl-pos.duckdns.org → DuckDNS → 72.50.207.152 (shared router WAN, hairpin NAT works)
    └─ router forwards TCP 80 / 443 / 8000 → 192.168.4.136 (PRIMARY)
          └─ Caddy (TLS) → uvicorn, bound 127.0.0.1:8001
```

| | PRIMARY | STANDBY (this machine) |
|---|---|---|
| hostname / user | `ramdev-wudali` | `ramdev-MacBookPro2` / `agastya71` |
| LAN IP | `192.168.4.136` | `192.168.4.21` wired (preferred), `.40` wifi |
| repo | `~/code/ski-swap-pos` | `~/code/ski-swap-pos` |
| app port | uvicorn on `127.0.0.1:8001`, Caddy on 80/443/8000 | stopped; on failover binds `0.0.0.0:8001` |
| data files | `backend/*.db` (registry.db + per-event DBs; possibly legacy swap.db) + `backend/.jwt_secret` | synced copies, installed into `backend/` |
| backups | cron every 6 h → `~/skiswap-backups/` (`backup_db.py`, covers only legacy swap-db — see §9) | timer every 15 min pulls snapshots → `~/skiswap-standby/` |
| SSH | port 22 closed until §2 is done | sshd running on :22 (installed 2026-10-16 by accident — harmless; harden, see §9) |

> **Rule of thumb:** anything marked `PRIMARY ▸` must run on `.136`;
> anything marked `STANDBY ▸` on this machine. The SSH-enable block in §2 was
> once accidentally run on the standby — result was harmless (§9) but the goal
> of it is only achieved on the primary.

## 2. One-time setup on the primary: enable the sync channel

`STANDBY ▸ scripts/sync_from_primary.sh` pulls data over SSH, so **port 22
must be open on the primary**. Run this **as `ramdev-wudali`, ON the primary
(`.136`)** — it does nothing useful on the standby:

```bash
# PRIMARY ▸
sudo apt-get install -y openssh-server
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICrJbBOa3/q1Rg2cBcXO/JJg3wKRd2aeeCHW4KGUhsXm agastya71@ramdev-MacBookPro2 skiswap-standby' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Optional but recommended (key-only SSH):

```bash
# PRIMARY ▸
echo 'PasswordAuthentication no' | sudo tee /etc/ssh/sshd_config.d/99-hardening.conf
sudo systemctl restart ssh
```

Verify from the standby (§4).

## 3. Standby machine: what is installed here

| Item | Location | State |
|------|----------|-------|
| Sync script | `~/code/ski-swap-pos/scripts/sync_from_primary.sh` | run by the timer; also runnable by hand |
| Sync timer (user systemd) | `~/.config/systemd/user/ski-swap-standby-sync.{service,timer}` | **enabled**, fires every 15 min |
| Standby app unit (user systemd) | `~/.config/systemd/user/ski-swap-pos-standby.service` | present, **not running** (cold standby by design; start only on failover) |
| SSH key (pull channel identity) | `~/.ssh/id_ed25519` | must be authorized on the primary (§2) |
| Latest pulled snapshot | `~/skiswap-standby/snapshot/` | rewritten each sync |
| Previous installs (rollback) | `~/skiswap-standby/prev-installs/` | last 3 kept |
| Logs | `journalctl --user -u ski-swap-standby-sync` | one entry per run |

How the sync works (why it is safe against a live primary):

1. Uses the **SQLite online backup API on the primary** for *every*
   `backend/*.db` — snapshots are consistent even while uvicorn writes.
   (Never `rsync`/`cp` a live SQLite file.)
2. `PRAGMA integrity_check` on the primary, and again after download.
3. Also copies `backend/.jwt_secret` — so after failover, tokens issued by
   the primary keep working here.
4. Installs into local `backend/` **only while no local app is listening on
   :8001** — the failover app must be started after the sync, never during.

### Boot persistence — linger (run on the STANDBY)

Without linger, user-level units (the timer!) only run while logged in. Run:

```bash
# STANDBY ▸
sudo loginctl enable-linger agastya71
loginctl show-user agastya71 -p Linger    # → Linger=yes
```

### The system-level app service — NOT on the standby

`deploy/install-service.sh` installs `ski-swap-pos.service` (auto-start at
boot, `Restart=always`, app bound to `127.0.0.1:8001`). It belongs on the
**primary** — or on this machine **only after promotion to primary (§7)**.

Running it on the standby is destructive to the standby design: an
auto-running app keeps port :8001 busy, so the sync interlock (§3) will SKIP
every install and the standby data staleness becomes unbounded. If it was
installed here by mistake:

```bash
# STANDBY ▸ (undo)
sudo systemctl disable --now ski-swap-pos
```

## 4. Verify the sync is live

```bash
# STANDBY ▸
ssh ramdev-wudali@192.168.4.136 'echo primary reachable'   # first time: accept host key
systemctl --user start ski-swap-standby-sync.service       # manual first sync
journalctl --user -u ski-swap-standby-sync -n 5            # expect "SYNC OK"
ls -l ~/skiswap-standby/snapshot/                          # snapshot files + .jwt_secret
```

If you see `remote snapshot failed ... sshd enabled on the primary?` — §2 was
not done on the primary. The timer keeps retrying every 15 min; nothing to
fix on the standby.

## 5. Failover drill (primary down/untrusted → traffic moves here)

```bash
# STANDBY ▸
journalctl --user -u ski-swap-standby-sync -n 1   # 1) how fresh is the snapshot?
ls -l ~/skiswap-standby/snapshot/
systemctl --user start ski-swap-pos-standby       # 2) start the app
curl -s http://127.0.0.1:8001/health              # 3) {"status":"ok"}
```

Then point stations at one of:

- **LAN-direct (immediate, no router access):** `http://192.168.4.21:8001`
- **Public URL (seamless, but only after §7 step 3 — Caddy installed here):**
  flip the router's TCP 80/443/8000 forwards from `.136` → `.21`;
  `https://mysl-pos.duckdns.org` then serves from this machine.

Spot-check data (docs/backup-recovery.md §3.5) and log in once via the UI
before letting stations proceed. Worst-case data loss = time since the last
successful sync (≤ 15 min normally). If the primary is still reachable, run
`scripts/sync_from_primary.sh` first to capture its final state.

## 6. The one-active rule (split-brain)

SQLite is single-writer — **exactly one server may take sales at a time.**

- After failover, the standby becomes active. Do **not** run the sync
  (it refuses installs while the local app runs anyway) and do **not**
  auto-fail back.
- To return traffic to the original primary: stop taking sales on whichever
  machine holds the newer data, sync newer→older (install the newer DB files
  onto the other machine the same way), verify, then restart serving there.
  When in doubt, keep the failover instance and fix later — never run both.

## 7. Promote the standby to permanent primary (planned cutover)

1. Announce a maintenance window; on the primary take a final backup:
   `PYTHON ▸ python3 scripts/backup_db.py`
2. Stop serving on `.136`: kill uvicorn, stop/disable its Caddy and the
   DuckDNS updater cron (so the old machine never fights over DNS).
3. On the standby: install Caddy so HTTPS keeps working:
   `STANDBY ▸ sudo bash deploy/install-caddy.sh`
4. One final sync to copy the latest databases and `.jwt_secret`:
   `STANDBY ▸ scripts/sync_from_primary.sh`
5. Switch this machine to the daemon for boot persistence:
   `STANDBY ▸ sudo bash deploy/install-service.sh`
   (Safe now: the machine is the primary; the interlock concern from §3 ends
   because this machine no longer needs to be cold.)
6. Router: re-point TCP 80/443/8000 forwards to `192.168.4.21`. First set a
   **DHCP reservation** for the wired NIC MAC `c8:bc:c8:8e:42:ec` → `.21`.
7. Optional: leave `.136` as a standby by running §2 in reverse there is not
   needed — instead install the sync script + timer on `.136` pointing at
   this machine afterwards (ask; or see §8).

## 8. Plan B — reverse direction (primary pushes; no sshd on the primary)

If SSH on the primary cannot be enabled, flip the channel: since 2026-10-16
sshd runs **here**, so the primary can *push* snapshots to the standby:

1. On the primary, generate a deploy key and hand the standby the public half:
   ```bash
   # PRIMARY ▸
   ssh-keygen -t ed25519 -N "" -f ~/.ssh/skiswap_push_key -C "ramdev-wudali@primary push->standby"
   cat ~/.ssh/skiswap_push_key.pub
   ```
2. Authorize that pubkey on the standby (`STANDBY ▸ ~/.ssh/authorized_keys`),
   restricted if desired: `command="..."` with the rsync receiver, or plain.
3. On the primary, a cron (every 15 min) runs `backup_db.py`-style snapshots
   and `rsync -e 'ssh -i ~/.ssh/skiswap_push_key' ... agastya71@192.168.4.21:skiswap-standby/snapshot/`.
   The standby's timer then switches to `--no-remote` mode (install what
   arrived) — ask to have the script/unit adjusted if Plan B is adopted.

## 9. Pending items / known gaps

- **Caddy not installed on the standby** (needs sudo). Until §7 step 3, the
  public-URL failover path is unavailable; LAN-direct (:8001) always works.
- **Linger** — run §3's one-liner if not done yet.
- **Primary's 6-hourly `backup_db.py` covers only legacy `swap.db`** — it does
  NOT snapshot `registry.db` or per-event DBs. Recommend adopting the §3
  snapshot method (or extending `backup_db.py`) on the primary so its offsite
  plan (rclone, per docs/backup-recovery.md §2) protects all databases.
- **sshd on the standby** was installed by accident (2026-10-16) — harmless
  self-key trust, LAN-only exposure — but if Plan B is not adopted, either
  harden it (`PasswordAuthentication no`, as §2 shows for the primary) or
  disable: `sudo systemctl disable --now ssh`.
- Both NICs (wired `.21`, wifi `.40`) are active on the standby; for stable
  router rules prefer wired + DHCP reservation, consider disabling wifi.
- The standby dev instance that ran on 2026-10-16 was stopped after setup;
  port 8001 is intentionally free.