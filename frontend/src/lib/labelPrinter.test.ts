/**
 * Tests for lib/labelPrinter — the per-workstation label-printer target and
 * the client-side delivery transports (Zebra Browser Print agent on
 * localhost, .zpl file download fallback) plus the print dispatch that keeps
 * the `label_printed` flag honest in every mode.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchIntakeLabels,
  dispatchItemLabel,
  findAgentPrinter,
  getLabelPrinterMode,
  resetBrowserPrintCache,
  setLabelPrinterMode,
  writeZplToAgent,
  type BrowserPrintDevice,
} from "./labelPrinter";
import { ackLabelPrinted, fetchLabelZpl, printLabel } from "../api/items";
import { ackIntakeLabels, fetchIntakeLabelsZpl, printIntakeLabels } from "../api/intakes";
import { AGENT_ZPL_DX_DOTS, AGENT_ZPL_DY_DOTS } from "./labelPrinter";

// Static + dynamic imports inside labelPrinter.ts resolve to these mocked modules.
vi.mock("../api/items", () => ({
  printLabel: vi.fn().mockResolvedValue({ id: 7, label_printed: true }),
  fetchLabelZpl: vi.fn().mockResolvedValue("^XA ZPL-ITEM ^XZ"),
  ackLabelPrinted: vi.fn().mockResolvedValue({ id: 7, label_printed: true }),
}));
vi.mock("../api/intakes", () => ({
  printIntakeLabels: vi.fn().mockResolvedValue({ intake_id: 3, printed: 2 }),
  fetchIntakeLabelsZpl: vi.fn().mockResolvedValue("^XA 1 ^XZ^XA 2 ^XZ"),
  ackIntakeLabels: vi.fn().mockResolvedValue({ intake_id: 3, acknowledged: 2 }),
}));

const ZEBRA: BrowserPrintDevice = {
  uid: "D8N231601489",
  name: "ZTC ZD421-203dpi ZPL",
  deviceType: "printer",
  connection: "usb",
};

type FetchMock = ReturnType<typeof vi.fn>;

/** Stub global fetch; map URL fragments to JSON bodies or Errors to reject. */
function stubFetch(responses: Record<string, unknown>): FetchMock {
  const impl = (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [fragment, response] of Object.entries(responses)) {
      if (!url.includes(fragment)) continue;
      if (response instanceof Error) return Promise.reject(response);
      return Promise.resolve(
        new Response(JSON.stringify(response), { status: 200, statusText: "OK" }),
      );
    }
    return Promise.reject(new Error(`no stub for ${url}`));
  };
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function callsOf(fetchMock: unknown): Array<[url: string, init?: RequestInit]> {
  return (fetchMock as { mock: { calls: Array<[url: string, init?: RequestInit]> } }).mock.calls;
}

function writeCallBodyUrl(calls: Array<[url: string, init?: RequestInit]>): { url: string; data: string; deviceUid: string } {
  const entry = calls.find(([url]) => url.includes("/write"));
  if (!entry) throw new Error("no /write call recorded");
  const body = JSON.parse(String(entry[1]?.body)) as {
    device: { uid: string };
    data: string;
  };
  return { url: entry[0], data: body.data, deviceUid: body.device.uid };
}

/** jsdom has no URL.createObjectURL — stub it (and restore after). */
function stubUrlObject(): { create: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> } {
  const create = vi.fn(() => "blob:stub");
  const revoke = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { value: create, configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revoke, configurable: true });
  return { create, revoke };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  resetBrowserPrintCache();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (URL as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
});

describe("mode storage", () => {
  it("defaults to server", () => {
    expect(getLabelPrinterMode()).toBe("server");
  });

  it("persists and reads back the agent/download modes", () => {
    setLabelPrinterMode("agent");
    expect(getLabelPrinterMode()).toBe("agent");
    setLabelPrinterMode("download");
    expect(getLabelPrinterMode()).toBe("download");
    setLabelPrinterMode("server");
    expect(getLabelPrinterMode()).toBe("server");
  });

  it("falls back to server when localStorage holds a corrupted value", () => {
    localStorage.setItem("label_printer_mode", "teleport");
    expect(getLabelPrinterMode()).toBe("server");
  });
});

describe("findAgentPrinter", () => {
  it("falls back to the http listener when https fails, and remembers it", async () => {
    const fetchMock = stubFetch({
      // HTTPS 9101 rejects until the browser has accepted the self-signed cert
      "https://localhost:9101/available": new Error("cert rejected"),
      "http://localhost:9100/available": { printer: [ZEBRA] },
    });
    const device = await findAgentPrinter();
    expect(device.uid).toBe(ZEBRA.uid);
    // Cached: the next discovery goes straight to the http listener — exactly
    // one more /available call (no https retry).
    await findAgentPrinter();
    const availableUrls = callsOf(fetchMock)
      .filter(([url]) => url.includes("available"))
      .map(([url]) => url);
    expect(availableUrls).toEqual([
      "https://localhost:9101/available",
      "http://localhost:9100/available",
      "http://localhost:9100/available",
    ]);
  });

  it("throws the install hint when no listener answers", async () => {
    stubFetch({});
    await expect(findAgentPrinter()).rejects.toThrow(/Browser Print agent not found/);
  });

  it("throws when the agent is reachable but has no printer attached", async () => {
    stubFetch({ "http://localhost:9100/available": { printer: [] } });
    await expect(findAgentPrinter()).rejects.toThrow(/found no printer/);
  });
});

describe("writeZplToAgent", () => {
  it("posts the device and ZPL data to /write", async () => {
    const fetchMock = stubFetch({ "https://localhost:9101/write": { ok: true } });
    await writeZplToAgent(ZEBRA, "^XA^XZ");
    const recorded = callsOf(fetchMock)[0];
    expect(recorded[0]).toBe("https://localhost:9101/write");
    expect(recorded[1]?.method).toBe("POST");
    const body = JSON.parse(String(recorded[1]?.body)) as {
      device: { uid: string };
      data: string;
    };
    expect(body.device.uid).toBe(ZEBRA.uid);
    expect(body.data).toBe("^XA^XZ");
  });

  it("surfaces a failed write", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 404 }))),
    );
    await expect(writeZplToAgent(ZEBRA, "^XA^XZ")).rejects.toThrow(/HTTP 404/);
  });
});

describe("dispatchItemLabel", () => {
  it("server mode uses the original server-attached print API", async () => {
    await dispatchItemLabel("server", 7, 2, true, "unused.zpl");
    expect(printLabel).toHaveBeenCalledWith(7, 2, true);
    expect(fetchLabelZpl).not.toHaveBeenCalled();
    expect(ackLabelPrinted).not.toHaveBeenCalled();
  });

  it("agent mode fetches ZPL, writes it, and acknowledges the print", async () => {
    const fetchMock = stubFetch({
      "https://localhost:9101/available": { printer: [ZEBRA] },
      "https://localhost:9101/write": { ok: true },
    });
    await dispatchItemLabel("agent", 7, 2, true, "label-ABC-001.zpl");
    expect(fetchLabelZpl).toHaveBeenCalledWith(7, 2, true, AGENT_ZPL_DX_DOTS, AGENT_ZPL_DY_DOTS);
    expect(ackLabelPrinted).toHaveBeenCalledWith(7);
    const { data, deviceUid } = writeCallBodyUrl(callsOf(fetchMock));
    expect(data).toBe("^XA ZPL-ITEM ^XZ");
    expect(deviceUid).toBe(ZEBRA.uid);
  });

  it("download mode saves the file and does NOT acknowledge", async () => {
    const { create, revoke } = stubUrlObject();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await dispatchItemLabel("download", 7, 1, false, "label-ABC-001.zpl");
    expect(fetchLabelZpl).toHaveBeenCalledWith(7, 1, false);
    expect(ackLabelPrinted).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalled();
    const blob = create.mock.calls[0][0] as Blob;
    expect(await blob.text()).toBe("^XA ZPL-ITEM ^XZ");
  });
});

describe("dispatchIntakeLabels", () => {
  it("server mode uses the original bulk print API", async () => {
    await dispatchIntakeLabels("server", 3, true, "unused.zpl");
    expect(printIntakeLabels).toHaveBeenCalledWith(3, true);
    expect(fetchIntakeLabelsZpl).not.toHaveBeenCalled();
  });

  it("agent mode sends one concatenated ZPL payload then acks every item", async () => {
    stubFetch({
      "https://localhost:9101/available": { printer: [ZEBRA] },
      "https://localhost:9101/write": { ok: true },
    });
    await dispatchIntakeLabels("agent", 3, false, "labels-intake-3.zpl");
    expect(fetchIntakeLabelsZpl).toHaveBeenCalledWith(3, false, AGENT_ZPL_DX_DOTS, AGENT_ZPL_DY_DOTS);
    expect(ackIntakeLabels).toHaveBeenCalledWith(3);
    const { data } = writeCallBodyUrl(
      callsOf(globalThis.fetch),
    );
    expect(data).toBe("^XA 1 ^XZ^XA 2 ^XZ");
  });

  it("download mode saves the file and does NOT acknowledge", async () => {
    const { revoke } = stubUrlObject();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await dispatchIntakeLabels("download", 3, false, "labels-intake-3.zpl");
    expect(ackIntakeLabels).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalled();
  });
});