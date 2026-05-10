# New Machine Setup

Tested on Linux Mint 21/22 (Ubuntu 22.04/24.04 base), x86_64.  
Applies to any Debian/Ubuntu-based distro.

---

## 1. System packages

```bash
sudo apt update
sudo apt install -y git curl build-essential libssl-dev libffi-dev
```

---

## 2. Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # v20.x
```

---

## 3. uv (Python toolchain)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env   # or open a new terminal
uv --version
```

---

## 4. Clone the repo

```bash
git clone https://github.com/agastya71/ski-swap-pos.git
cd ski-swap-pos
```

---

## 5. Backend — virtualenv + dependencies

```bash
cd backend
uv python install 3.11
uv venv --python 3.11
source .venv/bin/activate
uv pip install -r requirements.txt
```

---

## 6. Database migrations

```bash
# Run from backend/ with venv active
alembic upgrade head
```

---

## 7. Frontend — install + build

```bash
cd ../frontend
npm install
npm run build        # compiles to backend/static/
```

---

## 8. Seed the database

**Required before first login.** The app returns `503 No active event configured` on
every login attempt until an active event and at least one user exist.

```bash
cd ../backend
source .venv/bin/activate
python seed_demo.py
```

Default credentials created by the seeder:

| Username   | Password     | Role     |
|------------|--------------|----------|
| `admin`    | `admin123`   | admin    |
| `intake1`  | `intake123`  | intake   |
| `cashier1` | `cashier123` | cashier  |

---

## 9. Start the server

```bash
# still inside backend/ with venv active
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000` in a browser.  
Other devices on the same network can reach it at `http://<this-machine-ip>:8000`.

---

## 10. Zebra ZD421 label printer (USB)

On Linux, ZPL is written directly to `/dev/usb/lp0` — no CUPS, no driver needed.

```bash
# Add your user to the lp group (one-time, requires logout/login after)
sudo usermod -aG lp $USER
```

Plug in the printer, then verify the device appears:

```bash
ls /dev/usb/lp0
```

The default path in `config.py` is `/dev/usb/lp0`. If your system assigns a different
path (e.g. `/dev/usb/lp1`), set the env var before starting:

```bash
LABEL_PRINTER_PATH=/dev/usb/lp1 uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## 11. Subsequent starts (after first setup)

The frontend is already built. Only the backend needs to run:

```bash
cd ski-swap-pos/backend
source .venv/bin/activate
alembic upgrade head          # safe to re-run; no-ops if already current
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Or use the convenience script from the repo root:

```bash
cd ski-swap-pos
bash start.sh
```

> `start.sh` runs `pip install`, migrations, and uvicorn in sequence.
> With uv, replace the pip call inside it with `uv pip install` for faster installs.

---

## Seeding initial data

A fresh database has no event or users. Use the demo seeder:

```bash
cd backend
source .venv/bin/activate
python seed_demo.py
```

This creates a sample event, users for all three roles, sellers, and items.
See `backend/seed_demo.py` for the default credentials.

---

## 12. Rebuilding the frontend (after code changes)

```bash
cd frontend
npm run build
```

No server restart needed — FastAPI serves the updated files on the next request.
