/**
 * Shared input-formatting helpers for staff data-entry forms (plan B3,
 * docs/event-feedback-plan-2026-11-22.md): description capitalization (#8),
 * phone auto-format (#9), and 2-letter state accept (#10).
 *
 * @module format
 */
import { US_STATES } from "./usStates";

/** Capitalizes the first letter of every space-separated word (#8: "red
 *  scarf" → "Red Scarf"). Existing capitals are preserved, so acronyms and
 *  brand casing ("GORE-TEX gloves") survive; leading/trailing spaces are kept
 *  so the value stays cursor-stable while typing. */
export function capitalizeWords(value: string): string {
  return value.replace(/(^|[\s])([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
}

/** Formats a raw digit string as a US phone: (NNN) NNN-NNNN (#9). Accepts any
 *  partial input (1–10 digits — extra digits are truncated); non-digits are
 *  stripped so paste-with-dashes reformats cleanly. */
export function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** True when the string is a valid 2-letter US state/DC code (#10). */
export function isUsStateCode(value: string): boolean {
  return US_STATES.some((s) => s.code === value.toUpperCase());
}
