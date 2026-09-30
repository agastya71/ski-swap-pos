/**
 * Label printer target + client-side delivery transports.
 *
 * The default "server" mode is the original path: `POST /items/{id}/label` renders
 * and prints on the Zebra ZD421 attached to the SERVER (raw device → CUPS fallback
 * in `zpl.py::send_to_printer`). When the Zebra is attached to the BROWSER
 * workstation instead, two client-side modes deliver the label:
 *
 *  - "agent": fetch the ZPL text from the server (`GET /items/{id}/label.zpl`)
 *    and hand it to the locally attached printer through the Zebra Browser
 *    Print agent — the official localhost helper (http://localhost:9100,
 *    https://localhost:9101) with installers for Windows, macOS and Linux.
 *  - "download": fetch the same ZPL and save it as a `.zpl` file for manual
 *    printing — the always-works fallback on any OS.
 *
 * In the two client-side modes the browser acknowledges successful prints via
 * `POST /items/{id}/label-ack` (server path marks the flag itself), so the
 * `label_printed` delete-guardrail stays consistent across modes.
 *
 * @module labelPrinter
 */
import {
  ackIntakeLabels,
  fetchIntakeLabelsZpl,
  printIntakeLabels,
} from "../api/intakes";
import {
  ackLabelPrinted,
  fetchLabelZpl,
  printLabel,
} from "../api/items";

/** Where printed labels are delivered: the server-attached Zebra, a Zebra
 *  attached to this browser workstation (via the Browser Print agent), or a
 *  downloaded .zpl file for manual printing. */
export type LabelPrinterMode = "server" | "agent" | "download";

/** localStorage key persisting the per-workstation label printer target. */
const MODE_KEY = "label_printer_mode";

/** Read the persisted label-printer target. Defaults to "server" when unset,
 *  when the value is corrupted, or when localStorage is unavailable (tests,
 *  blocked storage). */
export function getLabelPrinterMode(): LabelPrinterMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === "agent" || stored === "download" || stored === "server") {
      return stored;
    }
  } catch {
    /* non-browser environment — fall through to the default */
  }
  return "server";
}

/** Persist the label-printer target for this workstation. */
export function setLabelPrinterMode(mode: LabelPrinterMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* non-browser environment — setting is lost but this session keeps it */
  }
}

// ── Zebra Browser Print agent client ────────────────────────────────────────

/** Shape of the device objects `/available` returns (subset we use). */
export interface BrowserPrintDevice {
  uid: string;
  name: string;
  deviceType?: string;
  connection?: string;
}

/**
 * The listeners Zebra Browser Print exposes. The official agent serves BOTH:
 * HTTPS (self-signed cert — the browser must have accepted it once) and HTTP.
 * HTTPS is tried first because the SPA is served over HTTPS; fetch to the
 * http://localhost listener works in Chromium as long as private-network
 * access rules allow it.
 */
const AGENT_BASES = ["https://localhost:9101/", "http://localhost:9100/"];

/** Remembers which listener answered (probed once per page load). */
let agentBase: string | null = null;

/** Test seam — forget the cached agent base URL. */
export function resetBrowserPrintCache(): void {
  const old = agentBase;
  agentBase = null;
  void old;
}

/**
 * Discover the first printer visible to the local Browser Print agent,
 * probing the known listeners in order and remembering the one that answers.
 *
 * @returns The local printer device descriptor for `POST /write`.
 * @throws Error with an actionable message when the agent is absent or has
 *   no printer attached.
 */
export async function findAgentPrinter(): Promise<BrowserPrintDevice> {
  const candidates = agentBase
    ? [agentBase, ...AGENT_BASES.filter((b) => b !== agentBase)]
    : AGENT_BASES;
  for (const base of candidates) {
    try {
      const res = await fetch(`${base}available`);
      if (!res.ok) continue;
      agentBase = base;
      const dto = (await res.json()) as {
        printer?: BrowserPrintDevice[];
        deviceList?: BrowserPrintDevice[];
      };
      const printers = [...(dto.printer ?? []), ...(dto.deviceList ?? [])].filter(
        (d) => (d.deviceType ?? "printer") === "printer",
      );
      if (printers.length > 0) return printers[0];
      throw new Error(
        "Browser Print agent is running but found no printer — is the Zebra connected and powered on?",
      );
    } catch (err) {
      // "No printer found" is an agent answer, not a transport failure — don't
      // fall through to the next listener just because the message threw.
      if (err instanceof Error && err.message.startsWith("Browser Print agent")) throw err;
      /* try the next listener */
    }
  }
  throw new Error(
    "Zebra Browser Print agent not found on this computer. Install it (zebra.com/browserprint) on the machine the Zebra is attached to — or switch label printing to 'Download .zpl file'.",
  );
}

/**
 * Write ZPL text to the local printer through the agent.
 *
 * @param device - Device descriptor from {@link findAgentPrinter}.
 * @param zpl - Raw ZPL text (one ^XA..^XZ document, or several concatenated).
 * @throws Error on agent write failure (HTTP status surfaced).
 */
export async function writeZplToAgent(device: BrowserPrintDevice, zpl: string): Promise<void> {
  const base = agentBase ?? AGENT_BASES[0];
  const res = await fetch(`${base}write`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ device, data: zpl }),
  });
  if (!res.ok) {
    throw new Error(`Browser Print write failed (HTTP ${res.status})`);
  }
}

/**
 * Save ZPL as a `.zpl` file download — the manual-printing fallback that
 * works on every OS (Zebra Setup Utilities on Windows, `lp -o raw` on
 * Linux/macOS, drag-drop into printer utilities).
 *
 * @param zpl - Raw ZPL text to save.
 * @param filename - Download filename, e.g. `label-ABC-001.zpl`.
 */
export function downloadZplFile(zpl: string, filename: string): void {
  const blob = new Blob([zpl], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Print dispatch ──────────────────────────────────────────────────────────

/** Per-item print dispatch used by ItemList. In "server" mode this is the
 *  original server-attached POST (unchanged behavior); otherwise it fetches
 *  the ZPL, delivers it locally (agent write or download) and — only for a
 *  confirmed agent print — acknowledges server-side so `label_printed` and
 *  the delete guardrail stay truthful. Downloaded labels do NOT set the flag
 *  (the label may never be physically printed). */
export async function dispatchItemLabel(
  mode: LabelPrinterMode,
  id: number,
  copies: number | undefined,
  codeAsText: boolean,
  filename: string,
): Promise<void> {
  if (mode === "server") {
    // Reuse the existing server-attached print API wholesale.
    await printLabel(id, copies, codeAsText);
    return;
  }
  const zpl = await fetchLabelZpl(id, copies, codeAsText);
  if (mode === "download") {
    downloadZplFile(zpl, filename);
    return;
  }
  const device = await findAgentPrinter();
  await writeZplToAgent(device, zpl);
  await ackLabelPrinted(id);
}

/** Bulk (intake) print dispatch — mirrors {@link dispatchItemLabel} for the
 *  "print labels for every item in this intake" flow. The agent/download ZPL
 *  is fetched as one concatenated payload; ack flags every item together,
 *  exactly like the server-attached POST /intakes/{id}/labels. */
export async function dispatchIntakeLabels(
  mode: LabelPrinterMode,
  intakeId: number,
  codeAsText: boolean,
  filename: string,
): Promise<void> {
  if (mode === "server") {
    await printIntakeLabels(intakeId, codeAsText);
    return;
  }
  const zpl = await fetchIntakeLabelsZpl(intakeId, codeAsText);
  if (mode === "download") {
    downloadZplFile(zpl, filename);
    return;
  }
  const device = await findAgentPrinter();
  await writeZplToAgent(device, zpl);
  await ackIntakeLabels(intakeId);
}