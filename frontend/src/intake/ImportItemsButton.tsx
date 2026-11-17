/**
 * Reusable "Import Items" control — a button that opens a file picker for the
 * bulk item template (.xlsx / .csv / .tsv), posts it to the intake import
 * endpoint, and shows a summary (imported / skipped + per-row errors).
 *
 * Used in the intake items step (individual consignors and vendors) and the
 * admin seller detail page, so both intake paths can bulk-import from a filled
 * template.
 *
 * @module ImportItemsButton
 */
import { useRef, useState, type ChangeEvent } from "react";
import { BUTTON_STYLE } from "../lib/buttons";
import { importItems } from "../api/intakes";
import { downloadImportTemplate } from "../api/items";
import { ImportOutcome } from "../components/ImportOutcome";
import type { ImportResult } from "../types";

/**
 * @param props.intakeId - ID of the intake session to import items into.
 * @param props.vendor - Whether the intake's seller is a vendor; selects which
 *   template the Download Template button fetches (vendor vs non-vendor layout).
 * @param props.onImported - Callback invoked with the import result after a successful import (e.g. to refresh the item list).
 */
export function ImportItemsButton({
  intakeId,
  vendor = false,
  onImported,
}: {
  intakeId: number;
  vendor?: boolean;
  onImported: (result: ImportResult) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const r = await importItems(intakeId, file);
      setResult(r);
      // Always refresh the list — even a partial import created items.
      onImported(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownloadTemplate() {
    try {
      await downloadImportTemplate(vendor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Template download failed");
    }
  }

  return (
    <div style={{ display: "inline-block" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={BUTTON_STYLE}
        >
          Import Items
        </button>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          title="Download the blank .xlsx bulk-import template to fill out (vendor or non-vendor layout, matching this seller)"
          style={BUTTON_STYLE}
        >
          Download Template
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.csv,.tsv"
        style={{ display: "none" }}
        onChange={handleFile}
      />
      {error && (
        <div
          role="alert"
          style={{ color: "#ef4444", fontSize: 13, marginTop: 6 }}
        >
          {error}
        </div>
      )}
      {result && (
        <div style={{ marginTop: 6 }}>
          <ImportOutcome result={result} onDismiss={() => setResult(null)} />
        </div>
      )}
    </div>
  );
}
