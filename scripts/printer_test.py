#!/usr/bin/env python3
"""
Zebra ZD421 Linux printer diagnostic script.

Runs two independent tests to isolate whether empty-label issues
are caused by the usblp kernel driver or by something else:

  Test 1 — device file, no newlines
    Writes ZPL as a single uninterrupted byte string to /dev/usb/lp*.
    Some usblp versions split writes on newline boundaries, garbling ZPL.
    Removing newlines eliminates that variable.

  Test 2 — pyusb direct USB (same path as macOS)
    Bypasses the usblp kernel driver entirely.
    Requires:  pip install pyusb
    May require:  sudo python3 scripts/printer_test.py  (USB access)

Usage:
    python3 scripts/printer_test.py [--device /dev/usb/lp1] [--test 1|2|both]

If Test 1 fails and Test 2 succeeds, switch send_to_printer() in
zpl.py to use the pyusb path on Linux as well (same as macOS).
"""

import argparse
import sys

ZEBRA_VID = 0x0A5F
ZEBRA_PID = 0x0185

ZPL_WITH_NEWLINES = (
    "^XA\n"
    "^FO50,50^A0N,50,50^FDHello Linux^FS\n"
    "^XZ\n"
)

ZPL_NO_NEWLINES = "^XA^FO50,50^A0N,50,50^FDHello Linux^FS^XZ"


def test_device_file(device: str, use_newlines: bool = False) -> None:
    zpl = ZPL_WITH_NEWLINES if use_newlines else ZPL_NO_NEWLINES
    label = "with newlines" if use_newlines else "no newlines"
    print(f"[Test 1] Writing ZPL ({label}) to {device} ...")
    with open(device, "wb") as f:
        f.write(zpl.encode("utf-8"))
    print("[Test 1] Done — check whether 'Hello Linux' printed correctly.")


def test_pyusb() -> None:
    print("[Test 2] Sending ZPL via pyusb (direct USB, no kernel driver) ...")
    try:
        import usb.core
        import usb.util
    except ImportError:
        print("[Test 2] SKIP — pyusb not installed.  Run:  pip install pyusb")
        return

    dev = usb.core.find(idVendor=ZEBRA_VID, idProduct=ZEBRA_PID)
    if dev is None:
        print(f"[Test 2] FAIL — Zebra printer not found (VID={ZEBRA_VID:#06x} PID={ZEBRA_PID:#06x})")
        return

    print(f"[Test 2] Found printer: {dev}")

    if dev.is_kernel_driver_active(0):
        print("[Test 2] Detaching usblp kernel driver ...")
        dev.detach_kernel_driver(0)

    dev.set_configuration()
    intf = dev.get_active_configuration()[(0, 0)]

    ep_out = usb.util.find_descriptor(
        intf,
        custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress)
        == usb.util.ENDPOINT_OUT,
    )
    if ep_out is None:
        print("[Test 2] FAIL — No USB OUT endpoint found.")
        return

    ep_out.write(ZPL_NO_NEWLINES.encode("utf-8"))
    print("[Test 2] Done — check whether 'Hello Linux' printed correctly.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Zebra ZD421 Linux printer diagnostic")
    parser.add_argument("--device", default="/dev/usb/lp1", help="Linux printer device path")
    parser.add_argument("--test", choices=["1", "2", "both"], default="both")
    args = parser.parse_args()

    if args.test in ("1", "both"):
        test_device_file(args.device)

    if args.test in ("2", "both"):
        test_pyusb()


if __name__ == "__main__":
    main()
