/**
 * v1 inline styles for the last unconverted surfaces — the login page, the
 * password-change modal, the two shared intake components, the documentation
 * page, and the Square card panel.
 *
 * Same contract as the per-feature style modules (`posStyles.ts`,
 * `intakeStyles.ts`, `adminStyles.ts`): every object here is the **verbatim**
 * v1 value, so `variantProps()` can hand it back untouched when the app is
 * rendering v1, and the login screen stays pixel-identical to what shipped
 * before the overhaul. v2 swaps these for the class names in
 * `frontend/src/ui-v2-auth.css`.
 *
 * Two values are worth calling out because they look arbitrary:
 * - `LOGIN.card.boxShadow` is `0 4px 24px rgba(0,0,0,0.07)` — a one-off
 *   marketing-style elevation, deliberately softer and wider than
 *   `--shadow-1`, because it floats alone on an otherwise empty page.
 * - `SQUARE.captureButton` is a fixed green (`#2e7d32`): Square's own branding
 *   guidance, not the app palette.
 *
 * @module uiStyles
 */
import type { CSSProperties } from "react";
import { BUTTON_STYLE } from "./lib/buttons";

/**
 * Re-exported so the six call sites this module serves need one import instead
 * of two — same pattern as `posStyles.ts`, `intakeStyles.ts` and
 * `adminStyles.ts`.
 */
export { variantProps, v1Only, v2Only } from "./components/layoutStyles";

/** `frontend/src/auth/LoginPage.tsx`. */
export const LOGIN = {
  shell: {
    minHeight: "100vh",
    background: "#f8fafc",
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  brandStripe: { height: 4, background: "#1e3a8a" } satisfies CSSProperties,
  centre: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  } satisfies CSSProperties,
  card: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "40px 48px",
    width: "100%",
    maxWidth: 400,
    boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
  } satisfies CSSProperties,
  brandBlock: { textAlign: "center", marginBottom: 32 } satisfies CSSProperties,
  brandTitle: {
    fontSize: 30,
    fontWeight: 800,
    color: "#1e3a8a",
    letterSpacing: "-0.03em",
    marginBottom: 6,
  } satisfies CSSProperties,
  brandSub: { fontSize: 13, color: "#64748b" } satisfies CSSProperties,
  field: { marginBottom: 16 } satisfies CSSProperties,
  fieldLast: { marginBottom: 20 } satisfies CSSProperties,
  label: { display: "block", marginBottom: 5 } satisfies CSSProperties,
  error: { marginBottom: 16 } satisfies CSSProperties,
  submit: { ...BUTTON_STYLE, width: "100%" } satisfies CSSProperties,
  footer: {
    padding: "14px 24px",
    textAlign: "center",
    fontSize: 12,
    color: "#94a3b8",
    borderTop: "1px solid #e2e8f0",
    background: "#ffffff",
  } satisfies CSSProperties,
} as const;

/**
 * `frontend/src/auth/ChangePasswordModal.tsx`.
 *
 * Same anatomy as the admin `ResetPasswordModal` but a separate table on
 * purpose: this modal predates it and uses `padding: 8` on its inputs and
 * `padding: '8px 16px'` on its buttons (the admin one uses `BUTTON_STYLE`).
 * Merging the two would be an unrequested visual change to a security screen.
 */
export const CHANGE_PASSWORD = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  } satisfies CSSProperties,
  panel: {
    background: "#fff",
    borderRadius: 6,
    padding: 24,
    width: 360,
    boxSizing: "border-box",
  } satisfies CSSProperties,
  title: { marginTop: 0 } satisfies CSSProperties,
  field: { marginBottom: 10 } satisfies CSSProperties,
  fieldLabel: {
    display: "block",
    fontSize: 13,
    marginBottom: 3,
  } satisfies CSSProperties,
  plainInput: {
    width: "100%",
    padding: 8,
    boxSizing: "border-box",
  } satisfies CSSProperties,
  passwordRow: { display: "flex", gap: 6 } satisfies CSSProperties,
  rowInput: { flex: 1, padding: 8, boxSizing: "border-box" } satisfies CSSProperties,
  suggestButton: { padding: "8px 12px" } satisfies CSSProperties,
  mismatch: { color: "#ef4444", fontSize: 12, marginTop: 4 } satisfies CSSProperties,
  policyList: {
    fontSize: 12,
    color: "#64748b",
    margin: "0 0 12px",
    paddingLeft: 20,
  } satisfies CSSProperties,
  unmet: { color: "#ef4444" } satisfies CSSProperties,
  met: { color: "#16a34a" } satisfies CSSProperties,
  error: { color: "#ef4444", marginBottom: 10 } satisfies CSSProperties,
  footer: { display: "flex", gap: 8, justifyContent: "flex-end" } satisfies CSSProperties,
  cancel: { padding: "8px 16px" } satisfies CSSProperties,
  submit: {
    padding: "8px 16px",
    background: "#1e3a8a",
    color: "#fff",
    border: "none",
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;

/**
 * `frontend/src/components/ImportOutcome.tsx`.
 *
 * The banner is a **three-way** skin, not a boolean: a partial import (skipped
 * rows) outranks warnings, which outrank plain success. v1 expressed that with
 * nested ternaries on the container; v2 emits a modifier class from
 * `importTone()` and keeps the same precedence in one place.
 */
export const IMPORT_OUTCOME = {
  /** Picks the banner skin: skipped rows beat warnings beat success. */
  tone: (skipped: number, hasWarnings: boolean): "error" | "warn" | "ok" => {
    if (skipped > 0) return "error";
    if (hasWarnings) return "warn";
    return "ok";
  },
  skin: {
    error: {
      background: "#fef2f2",
      border: "1px solid #fca5a5",
    } satisfies CSSProperties,
    warn: { background: "#fffbeb", border: "1px solid #fcd34d" } satisfies CSSProperties,
    ok: { background: "#f0fdf4", border: "1px solid #86efac" } satisfies CSSProperties,
  },
  base: {
    borderRadius: 6,
    padding: "8px 12px",
    marginBottom: 12,
    fontSize: 13,
    color: "#334155",
  } satisfies CSSProperties,
  dismiss: {
    marginLeft: 8,
    border: "none",
    background: "none",
    cursor: "pointer",
    fontSize: 14,
  } satisfies CSSProperties,
  note: { marginTop: 2 } satisfies CSSProperties,
  errorList: {
    margin: "4px 0 0",
    paddingLeft: 20,
    color: "#b91c1c",
  } satisfies CSSProperties,
  warningList: {
    margin: "4px 0 0",
    paddingLeft: 20,
    color: "#92400e",
  } satisfies CSSProperties,
} as const;

/** `frontend/src/components/SellerCombobox.tsx`. */
export const SELLER_COMBOBOX = {
  root: {
    position: "relative",
    display: "flex",
    gap: 4,
    alignItems: "center",
  } satisfies CSSProperties,
  input: {
    flex: 1,
    padding: "6px 10px",
    border: "1px solid #1e3a8a",
    borderRadius: 4,
  } satisfies CSSProperties,
  clearButton: { padding: "4px 8px" } satisfies CSSProperties,
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 20,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 4,
    boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
    maxHeight: 240,
    overflowY: "auto",
  } satisfies CSSProperties,
  option: {
    display: "block",
    width: "100%",
    padding: "8px 12px",
    textAlign: "left",
    border: "none",
    background: "none",
    borderBottom: "1px solid #f1f5f9",
    cursor: "pointer",
    fontSize: 14,
  } satisfies CSSProperties,
  optionCode: { color: "#1e3a8a" } satisfies CSSProperties,
  optionCompany: { color: "#64748b", marginLeft: 6 } satisfies CSSProperties,
} as const;

/** `frontend/src/docs/DocumentationPage.tsx`. */
export const DOCS_PAGE = {
  panel: {
    marginTop: 24,
    padding: 12,
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    background: "#f8fafc",
    fontSize: 13,
  } satisfies CSSProperties,
  blurb: { marginTop: 4, color: "#475569" } satisfies CSSProperties,
  links: { marginTop: 8, display: "flex", gap: 16 } satisfies CSSProperties,
  link: { color: "#1a237e" } satisfies CSSProperties,
} as const;

/**
 * `frontend/src/pos/SquarePayment.tsx`.
 *
 * `#square-card-container` is the mount point Square's SDK injects its iframe
 * into, so its `minHeight` is a loading placeholder, not styling polish —
 * changing it makes the card field jump when the iframe arrives.
 */
export const SQUARE = {
  message: { color: "orange", margin: 0 } satisfies CSSProperties,
  container: {
    minHeight: 89,
    border: "1px solid #ccc",
    padding: 4,
    marginBottom: 8,
  } satisfies CSSProperties,
  captureButton: {
    padding: "8px 20px",
    background: "#2e7d32",
    color: "white",
    border: "none",
    cursor: "pointer",
  } satisfies CSSProperties,
  captureButtonDisabled: {
    padding: "8px 20px",
    background: "#2e7d32",
    color: "white",
    border: "none",
    cursor: "not-allowed",
  } satisfies CSSProperties,
} as const;
