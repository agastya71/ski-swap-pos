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
import { useUiVariant } from "../lib/uiVariant";
import { IMPORT_OUTCOME, variantProps } from "../uiStyles";

/** The subset of an import summary this banner needs (ImportResult and
 * WorksheetImportResult both satisfy it). */
export type ImportOutcomeData = Pick<
  ImportResult,
  "imported" | "skipped" | "errors"
> & { warnings?: string[] };

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
  const v2 = useUiVariant() === "v2";
  // One tone function drives both variants: v2 maps it to a modifier class,
  // v1 to the two inline values it used to compute with nested ternaries.
  const tone = IMPORT_OUTCOME.tone(skipped, hasWarnings);

  return (
    <div
      role="status"
      {...(v2
        ? { className: `ui2-io ui2-io--${tone}` }
        : { style: { ...IMPORT_OUTCOME.base, ...IMPORT_OUTCOME.skin[tone] } })}
    >
      {heading ? (
        <div>
          {heading}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss import result"
              {...variantProps(v2, "ui2-io-dismiss", IMPORT_OUTCOME.dismiss)}
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
              {...variantProps(v2, "ui2-io-dismiss", IMPORT_OUTCOME.dismiss)}
            >
              ×
            </button>
          )}
        </div>
      )}
      {skipped > 0 && (
        <div {...variantProps(v2, "ui2-io-note", IMPORT_OUTCOME.note)}>
          The item{skipped !== 1 ? "s" : ""} in the row
          {skipped !== 1 ? "s" : ""} below {skipped !== 1 ? "were" : "was"} NOT
          imported — fix the file and import it again.
        </div>
      )}
      {errors.length > 0 && (
        <ul
          aria-label="Skipped rows"
          {...variantProps(v2, "ui2-io-errors", IMPORT_OUTCOME.errorList)}
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
          {...variantProps(v2, "ui2-io-warnings", IMPORT_OUTCOME.warningList)}
        >
          {warnings!.map((w, idx) => (
            <li key={idx}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
