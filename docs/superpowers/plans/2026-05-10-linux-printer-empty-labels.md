# Linux Printer — Empty / Garbled Labels

> **Status:** in progress. Diagnosis tooling shipped (PR #41); root cause not yet
> confirmed on real hardware; fix in `send_to_printer()` not yet applied.
>
> **Tracking:** this file is the canonical log for the printer work. Update the
> checklist and append entries to the **Log** section as work proceeds.

## Hardware

- Zebra ZD421, 4" label stock, 203 dpi → print width **812 dots** (`_PRINT_WIDTH` in `backend/app/services/zpl.py`).
- USB connection. USB IDs: VID `0x0A5F`, PID `0x0185`.
- Linux target: raw write to `/dev/usb/lp0` (no CUPS). macOS target: pyusb direct USB.

## Symptom

Labels come out empty or garbled when printed from Linux. macOS path is assumed
working (pyusb). The ZPL content itself (from `generate_zpl`) is verified by
unit tests in `backend/tests/test_zpl.py` — the failure is in the **transport**,
not the label data.

## Shipped so far

| Change | PR | Notes |
|--------|----|-------|
| ZPL layout for ZD421 4" / 203 dpi | #39 | `generate_zpl` rewritten; `_PRINT_WIDTH=812`; centered barcode |
| Linux printer diagnostic script | #41 | `scripts/printer_test.py` — two independent tests |
| Setup doc: `/dev/usb/lp0` + `lp` group + `LABEL_PRINTER_PATH` | — | `docs/setup-new-machine.md` §10 |
| 503 root cause documented (login needs active event) | 0737388 | unrelated to labels but same setup doc |

## Diagnosis plan (run on the real printer host)

Prereq: printer plugged in, `ls /dev/usb/lp*` shows the device, user is in the
`lp` group (re-login after `sudo usermod -aG lp $USER`).

- [ ] **D1. Confirm device path** — `ls -l /dev/usb/lp*`; note which `lpN` is the Zebra.
- [ ] **D2. Run Test 1 (device file, no newlines)**
      `python3 scripts/printer_test.py --device /dev/usb/lp0 --test 1`
      Expected: prints "Hello Linux". **If it prints correctly → newlines are the
      problem (usblp splits writes on newline boundaries).**
- [ ] **D3. Run Test 1b (device file, WITH newlines)** — add `--newlines` flag
      (not yet implemented in the script; see Task A below) to reproduce the
      app's exact behaviour. **If D2 succeeds and D3 fails → confirms newlines.**
- [ ] **D4. Run Test 2 (pyusb direct USB)**
      `pip install pyusb` then `sudo python3 scripts/printer_test.py --test 2`
      Expected: prints "Hello Linux". **If D2 fails and D4 succeeds → usblp
      kernel driver is the problem; switch Linux to the pyusb path.**
- [ ] **D5. Record result** in the Log section below.

## Fix branches (apply based on D-results)

### Branch A — newlines are the problem (D2 ✓, D3 ✗)

`usblp` splits the write on `\n` boundaries; each fragment arrives as a separate
print job / gets garbled. Fix in `backend/app/services/zpl.py`:

- On the Linux device-file path, strip `\n` from the ZPL before writing (ZPL is
  whitespace-insensitive between `^` fields), **or** write the full byte string
  in a single `os.write()` with no newline splitting. Prefer stripping newlines
  — simplest and matches what Test 1 already proved works.

### Branch B — usblp is the problem (D2 ✗, D4 ✓)

Drop the device-file path entirely; route Linux through the same `_send_usb`
pyusb path macOS already uses. In `send_to_printer()`:

```python
def send_to_printer(zpl: str, printer_path: str = LABEL_PRINTER_PATH) -> None:
    # USB printer — pyusb works on both macOS and Linux
    _send_usb(zpl)
```

Caveat: on Linux this requires the process to have USB access (detach the
`usblp` kernel driver, or run as a user with permission / `sudo`). Document the
udev rule or `lp`-group requirement in `docs/setup-new-machine.md`.

### Branch C — both fail

Hardware/cable/media issue, or wrong device path. Re-check D1 and the physical
setup before touching code.

## Implementation tasks

- [ ] **Task A — add `--newlines` flag to `scripts/printer_test.py`** so Test 1
      can reproduce the app's exact newline-containing write (D3).
- [ ] **Task B — run D1–D5 on the printer host and record results.**
- [ ] **Task C — apply Branch A or B fix in `backend/app/services/zpl.py`.**
- [ ] **Task D — add a unit test in `backend/tests/test_zpl.py` covering the
      chosen transport behaviour** (e.g. Linux path strips newlines; or Linux
      path delegates to `_send_usb`). Mock `open`/`usb.core` as appropriate.
- [ ] **Task E — update `docs/setup-new-machine.md` §10** with the confirmed
      working configuration and any udev/permission notes.
- [ ] **Task F — manual verify** on the printer: single label via
      `POST /items/{id}/label` and batch via `POST /intakes/{id}/labels`.

## Log

- 2026-05-10 — PR #39: ZPL layout updated for ZD421 4" / 203 dpi.
- 2026-05-10 — PR #41: `scripts/printer_test.py` diagnostic added (Tests 1 & 2).
- 2026-05-10 — `docs/setup-new-machine.md`: documented `/dev/usb/lp0` setup,
  `LABEL_PRINTER_PATH` override, and 503-on-login root cause.
- 2026-08-16 — created this tracking doc; confirmed no transport fix applied yet.