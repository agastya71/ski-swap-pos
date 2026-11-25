/**
 * Layout style tables (phase U2 of docs/ui-overhaul-ab-plan-2026-11-24.md).
 *
 * The v1 shell is styled with inline `style={{}}` objects; v1 must stay
 * pixel-identical, so those objects are kept verbatim here instead of being
 * rewritten as CSS. v2 styling lives in `ui-v2-shell.css` and is applied by
 * class name only. `variantProps` picks one or the other so `Layout.tsx`
 * stays a plain structure render with no branching per element.
 */
import type { CSSProperties } from "react";

/** Returns the class name + inline style for the active variant. */
export function variantProps(
  v2: boolean,
  className: string,
  v1Style: CSSProperties,
): { className: string | undefined; style: CSSProperties | undefined } {
  return v2
    ? { className: className || undefined, style: undefined }
    : { className: undefined, style: v1Style };
}

/** Inline style objects for the v1 shell — byte-identical to the pre-U2 Layout. */
export const V1 = {
  shell: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#f8fafc",
  } satisfies CSSProperties,

  brandStripe: { height: 4, background: "#1e3a8a" } satisfies CSSProperties,

  header: {
    background: "#ffffff",
    borderBottom: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    padding: "0 24px",
    gap: 0,
  } satisfies CSSProperties,

  brand: {
    fontWeight: 800,
    fontSize: 17,
    color: "#1e3a8a",
    letterSpacing: "-0.03em",
    marginRight: 24,
    whiteSpace: "nowrap",
    userSelect: "none",
  } satisfies CSSProperties,

  nav: { display: "flex", flex: 1 } satisfies CSSProperties,

  headerActions: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,

  userName: { fontSize: 13, color: "#64748b" } satisfies CSSProperties,

  roleBadge: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    background: "#dbeafe",
    color: "#1e40af",
    padding: "3px 7px",
    borderRadius: 3,
  } satisfies CSSProperties,

  headerButton: {
    background: "#ffffff",
    color: "#1e3a8a",
    border: "1px solid #1e3a8a",
    padding: "5px 14px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 4,
  } satisfies CSSProperties,

  main: { flex: 1, padding: "28px 32px" } satisfies CSSProperties,

  footer: {
    background: "#ffffff",
    borderTop: "1px solid #e2e8f0",
    padding: "12px 32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#94a3b8",
  } satisfies CSSProperties,
} as const;
