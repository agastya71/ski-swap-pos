/**
 * Shared result banner for the three bulk-import surfaces (per-intake import,
 * admin seller detail, and the worksheet banner in the intake module).
 *
 * The import never fails silently: a partial import reports how many rows made
 * it in, why each skipped row was rejected, and any non-fatal warnings about
 * rows that DID import (e.g. a suspicious re-upload of the same file). Every
 * surface renders this one component so the wording, colours and ordering are
 * identical no matter where the upload started.
 *
 * @module ImportOutcome
 */
import type { ReactNode } from "react";
import type { ImportResult } from "../types";

/** The subset of an import summary this banner needs (ImportResult and
 * WorksheetImportResult both satisfy it). */
export type ImportOutcomeData = Pick<
  ImportResult,
  "imported" | "skipped" | "errors"
> & { warnings?: string[] };

const ERROR_RED = "#b91c1c";
const WARN_AMBER = "#92400e";
const TEXT_SLATE = "#334155";

/**
 * Render the outcome of a bulk item import.
 *
 * @param props.result - Counts plus per-row errors/warnings from the backend.
 * @param props.heading - Optional caller-supplied summary line (the worksheet
 *   surface names the seller/intake there); when given, this component skips its
 *   own counts line and appends only the skipped-row and warning details.
 * @param props.onDismiss - When provided, shows a × button to clear the banner.
 * @returns A role="status" summary block; error/warning lists are labelled so
 *   screen readers announce why rows were skipped.
 */
export function ImportOutcome({
  result,
  heading,
  onDismiss,
}: {
  result: ImportOutcomeData;
  heading?: ReactNode;
  onDismiss?: () => void;
}) {
  const { imported, skipped, errors, warnings } = result;
  const hasWarnings = Boolean(warnings && warnings.length > 0);

  return (
    <div
      role="status"
      style={{
        background:
          skipped > 0 ? "#fef2f2" : hasWarnings ? "#fffbeb" : "#f0fdf4",
        border: `1px solid ${skipped > 0 ? "#fca5a5" : hasWarnings ? "#fcd34d" : "#86efac"}`,
        borderRadius: 6,
        padding: "8px 12px",
        marginBottom: 12,
        fontSize: 13,
        color: TEXT_SLATE,
      }}
    >
      {heading ? (
        <div>
          {heading}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss import result"
              style={{
                marginLeft: 8,
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ×
            </button>
          )}
        </div>
      ) : (
        <div>
          Imported <strong>{imported}</strong> item{imported !== 1 ? "s" : ""}.
          {skipped > 0 && (
            <>
              {" "}
              Skipped <strong>{skipped}</strong> row{skipped !== 1 ? "s" : ""}.
            </>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss import result"
              style={{
                marginLeft: 8,
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ×
            </button>
          )}
        </div>
      )}
      {skipped > 0 && (
        <div style={{ marginTop: 2 }}>
          The item{skipped !== 1 ? "s" : ""} in the row
          {skipped !== 1 ? "s" : ""} below {skipped !== 1 ? "were" : "was"} NOT
          imported — fix the file and import it again.
        </div>
      )}
      {errors.length > 0 && (
        <ul
          aria-label="Skipped rows"
          style={{ margin: "4px 0 0", paddingLeft: 20, color: ERROR_RED }}
        >
          {errors.map((er) => (
            <li key={`${er.row}-${er.reason}`}>
              Row {er.row}: {er.reason}
            </li>
          ))}
        </ul>
      )}
      {hasWarnings && (
        <ul
          aria-label="Import warnings"
          style={{ margin: "4px 0 0", paddingLeft: 20, color: WARN_AMBER }}
        >
          {warnings!.map((w, idx) => (
            <li key={idx}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
