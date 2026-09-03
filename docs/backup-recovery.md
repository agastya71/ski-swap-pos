# Database Backup & Recovery

Routine for backing up the Ski Swap POS SQLite database (`backend/swap.db`),
and the exact procedure to recover from a backup. Set up on the event machine
(2026-09-02, branch `feat/db-backup-routine`).

---

## 1. What runs, and when

| | |
| --- | --- |
| **Script** | `scripts/backup_db.py` (repo) |
| **Schedule** | every 6 hours — `0 */6 * * *` (00:00, 06:00, 12:00, 18:00 local) |
| **Installed via** | user crontab (`crontab -l` to view) with `flock` guard |
| **Destination** | `~/skiswap-backups/` — **outside the repo**, so a repo wipe cannot take backups with it |
| **Retention** | 30 days local (≈ 120 files); oldest pruned automatically each run |
| **Log** | `~/skiswap-backups/backup.log` (appended by cron) |

Worst-case data-loss window: **up to 6 hours of sales** (plus anything since the
last completed backup). On event days, take an extra manual backup before doors
open and consider tightening the cadence (see §5).

### How the backup is taken (and why not `cp`)

The script opens `backend/swap.db` **read-only** and uses the SQLite online
backup API (`sqlite3.Connection.backup`). That produces a consistent snapshot
even while uvicorn is writing — a naive `cp` of a live SQLite file can tear
pages mid-write and yield a corrupt copy. Each backup is verified with
`PRAGMA integrity_check` before being promoted to its final
`swap-YYYYmmdd-HHMMSS.db` name; failed/partial files are deleted, not kept.

Manual ad-hoc backup (safe anytime, even mid-event):

```bash
/usr/bin/python3 /home/ramdev-wudali/code/ski-swap-pos/scripts/backup_db.py
```

Options: `--dest DIR`, `--keep-days N`, `--quiet`. Run it with the same
interpreter as cron (`/usr/bin/python3`); the backend venv is **not** required.

---

## 2. Where backups should be stored (strategy)

Three tiers; the first is implemented, the second is the recommended follow-up:

1. **Local disk — `~/skiswap-backups/` (implemented).** Protects against DB
   corruption, a bad migration, a mistaken delete, or a failed `alembic`
   upgrade. Does **not** protect against disk or machine loss — backups on the
   same disk die with the disk.
2. **Offsite copy (recommended next step).** Sync `~/skiswap-backups/` to cloud
   object storage with `rclone` (not yet installed):

   ```bash
   sudo apt install rclone
   rclone config                       # create a remote, e.g. name "backup"
   # then add to crontab, right after the backup line:
   # 30 0 * * * rclone copy /home/ramdev-wudali/skiswap-backups backup:skiswap-backups --max-age 30d --quiet
   ```

   Suggested remotes, in order of fit:
   - **Google Drive** — free 15 GB (the DB is ~125 KB, so decades of headroom);
     `rclone config` walk-through covers the OAuth.
   - **Backblaze B2** — ~$6/TB-month, S3-compatible, no surprise egress fees at
     this scale.
   - **AWS S3 / GCS** — sensible if the NPO already holds cloud credits (the
     hosting-options spec §5 lists Google Cloud for Nonprofits / AWS
     promotional credits as likely sources).

   For encrypted/deduplicated versioning instead of plain copies, `restic`
   against a B2/S3 backend is the heavier-duty alternative — overkill at this
   data size, but the right call if other project data joins the pool.
3. **Air-gapped final copy (event-day belt-and-braces).** After the event,
   copy the last backup to a USB stick alongside the exported reports. Cheap
   insurance; already half-covered by the manual `POST /admin/backup` ZIP
   endpoint, which remains available for one-off hand-offs.

Note: `backend/swap.db.bak` (2026-08-19) is a stale one-off copy from the
quantity-model migration work and predates this routine — kept for now as an
extra artifact, but not part of the routine.

---

## 3. Recovery procedure (from a backup)

Assumptions: the repo is present (or re-cloned) and `start.sh` works. The
backup carries its own `alembic_version`, so it is self-describing.

### 3.1 Pick the backup to restore

```bash
ls -lt ~/skiswap-backups/            # newest first; filenames carry UTC timestamps
```

Choose the newest file that predates the problem. `swap-20260903-003334.db`
means 2026-09-03 00:33:34 UTC (cron runs on the hour: 00/06/12/18 local =
CDT, UTC−5 here; double-check the offset against the log).

### 3.2 Stop the server

```bash
pgrep -af uvicorn                    # note the PID (look for --port 8001)
kill <PID>                           # graceful; wait, then repeat / -9 if needed
```

(Leave Caddy running; it will just 502 until the app is back.)

### 3.3 Swap in the restored database

```bash
cd /home/ramdev-wudali/code/ski-swap-pos/backend
mv swap.db swap.db.damaged-$(date +%Y%m%d-%H%M%S)   # keep the evidence
cp ~/skiswap-backups/swap-YYYYmmdd-HHMMSS.db swap.db
rm -f swap.db-wal swap.db-shm        # safety no-op with journal_mode=delete,
                                     # but stale sidecars after a crash would
                                     # corrupt the restored copy — always remove
```

### 3.4 Start the server

```bash
cd /home/ramdev-wudali/code/ski-swap-pos && bash start.sh
```

`start.sh` runs `alembic upgrade head` first:

- **Code newer than the backup** (usual case — restoring last week's file onto
  current `main`): alembic applies only the migrations the backup is missing.
  Safe and expected; the backup's `alembic_version` tells alembic where to
  resume.
- **Code older than the backup**: alembic errors out — check out a repo state
  at-or-after the backup's date first.
- The seed step is a no-op after a restore as long as the restored DB contains
  an active event (it will).

### 3.5 Verify the restore

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8001/health   # expect 200
```

Then spot-check data volume against what you expect (the drill used this):

```bash
python3 - <<'EOF'
import sqlite3
db = sqlite3.connect('file:backend/swap.db?mode=ro', uri=True)
for t in ['item', 'seller', 'sale', 'sale_item', 'intake', 'event', 'user']:
    print(t, db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0])
EOF
```

Log in via the UI with a real cashier/intake account and confirm an event,
a seller, and an item look right. If a backup is suspected corrupt, the script
already ran `PRAGMA integrity_check` on it at creation time — any `ok` backup
in the log is trustworthy; pick an older one otherwise.

### 3.6 Restore onto a different machine

Clone the repo → `bash start.sh` once (creates venv, deps) → stop the server →
follow §3.3 with the copied backup file → start again. `JWT_SECRET` lives in
`backend/.jwt_secret` (gitignored); if it is *not* carried over, existing login
tokens from the old machine are invalidated and everyone logs in again — data
is unaffected. If it *is* carried over, keep it out of any backup you share.

---

## 4. Where this is documented / operated

- Script: `scripts/backup_db.py` (self-documenting `--help`)
- Cron: `crontab -l` → `0 */6 * * * ...` line (added 2026-09-02)
- Log: `~/skiswap-backups/backup.log`
- Runbook: see §1 "Architecture" for the surrounding topology; this file is the
  authority for backups/recovery.
- Related: `POST /admin/backup` (manual ZIP of the DB, §6 of the runbook) —
  still available for one-off downloads, but the cron routine above is the
  scheduled safety net.

## 5. Cadence trade-off

6-hourly was chosen to bound loss at ≤ 6 h of sales while keeping the local
footprint trivial (~125 KB × 4/day × 30 days ≈ 15 MB). If an event weekend
needs tighter protection, temporarily raise the cron frequency for the weekend
(e.g. `0 * * * *` hourly) or fire manual backups at intake surges — the script
is stateless and safe to run concurrently with itself (flock + read-only
source).
