/**
 * Intake style tables (phase U4 of docs/ui-overhaul-ab-plan-2026-11-24.md).
 *
 * Same contract as `pos/posStyles.ts` and `components/layoutStyles.ts`: the v1
 * inline objects are kept here verbatim so v1 renders pixel-identically, and v2
 * styling is applied by class name from `intake-v2.css`.
 *
 * Part 1 covers the seller-entry path — `IntakeForm`, `SellerSearch`,
 * `SellerForm`, `ImportItemsButton` and the `IntakeModulePage` chrome. Those
 * five files carry no `<table>`, so the responsive-table work (the shared
 * `TableScroll`/`data-stack` pattern from U2, still unused by any page) lands in
 * part 2 with `ItemList` / `ItemSearchPage` / `IntakePage`, where the tables are.
 */
import type { CSSProperties } from "react";
import { BUTTON_STYLE } from "../lib/buttons";

export { variantProps, v1Only, v2Only } from "../components/layoutStyles";

/** Shared fieldset/legend pair — identical in IntakeForm and SellerForm. */
const FIELDSET: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 4,
  padding: "10px 12px",
  marginBottom: 10,
};

const LEGEND: CSSProperties = { fontSize: 13, color: "#64748b" };

/** Navy used for intake chrome buttons/tabs in v1 (distinct from --navy #1e3a8a). */
const INTAKE_NAVY = "#1a237e";

export const INTAKE_FORM = {
  fieldset: FIELDSET,
  legend: LEGEND,
  row: { marginBottom: 10 } satisfies CSSProperties,
  hint: { fontSize: 11, color: "#64748b" } satisfies CSSProperties,
  error: { color: "red", marginBottom: 10 } satisfies CSSProperties,
} as const;

export const SELLER_SEARCH = {
  input: {
    width: "100%",
    padding: 8,
    marginBottom: 8,
    boxSizing: "border-box",
  } satisfies CSSProperties,
  list: { listStyle: "none", padding: 0, margin: 0 } satisfies CSSProperties,
  resultButton: {
    width: "100%",
    textAlign: "left",
    padding: 8,
    cursor: "pointer",
    background: "none",
    border: "1px solid #ccc",
    marginBottom: 4,
  } satisfies CSSProperties,
  newButton: { ...BUTTON_STYLE, marginTop: 8 } satisfies CSSProperties,
} as const;

export const IMPORT_BUTTON = {
  /** Both import buttons used BUTTON_STYLE verbatim in v1. */
  button: BUTTON_STYLE satisfies CSSProperties,
  root: { display: "inline-block" } satisfies CSSProperties,
  row: { display: "flex", gap: 8 } satisfies CSSProperties,
  hiddenInput: { display: "none" } satisfies CSSProperties,
  error: {
    color: "#ef4444",
    fontSize: 13,
    marginTop: 6,
  } satisfies CSSProperties,
  result: { marginTop: 6 } satisfies CSSProperties,
} as const;

export const SELLER_FORM = {
  fieldset: FIELDSET,
  legend: LEGEND,
  /** Per-field wrapper produced by the `field()` helper. */
  fieldWrap: { marginBottom: 10 } satisfies CSSProperties,
  fieldLabel: { display: "block", marginBottom: 3 } satisfies CSSProperties,
  fieldInput: {
    width: "100%",
    padding: 6,
    boxSizing: "border-box",
  } satisfies CSSProperties,
  checkboxRow: { marginBottom: 10 } satisfies CSSProperties,
  donationRow: { marginBottom: 6 } satisfies CSSProperties,
  error: { color: "red", marginBottom: 10 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8 } satisfies CSSProperties,
} as const;

export const INTAKE_MODULE = {
  tabBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: `2px solid ${INTAKE_NAVY}`,
    paddingBottom: 8,
    marginBottom: 16,
  } satisfies CSSProperties,
  tabGroup: { display: "flex", gap: 4 } satisfies CSSProperties,
  /** Tab button — active state flips background and text colour together. */
  tab: (active: boolean): CSSProperties => ({
    padding: "6px 16px",
    background: active ? INTAKE_NAVY : "transparent",
    color: active ? "white" : INTAKE_NAVY,
    border: `1px solid ${INTAKE_NAVY}`,
    cursor: "pointer",
  }),
  eventName: { fontSize: 16 } satisfies CSSProperties,
  actionGroup: { display: "flex", gap: 8 } satisfies CSSProperties,
  /** Outline button used by the three header actions. */
  ghostButton: (busy = false): CSSProperties => ({
    border: `1px solid ${INTAKE_NAVY}`,
    color: INTAKE_NAVY,
    background: "none",
    padding: "4px 10px",
    cursor: busy ? "wait" : "pointer",
    borderRadius: 3,
    fontSize: 13,
  }),
  hiddenInput: { display: "none" } satisfies CSSProperties,
  reviewPanel: {
    margin: "0 0 16px",
    padding: 12,
    border: "1px solid #f59e0b",
    borderRadius: 6,
    background: "#fffbeb",
  } satisfies CSSProperties,
  reviewMeta: { marginTop: 6, fontSize: 13 } satisfies CSSProperties,
  reviewReason: {
    marginTop: 4,
    fontSize: 13,
    color: "#92400e",
  } satisfies CSSProperties,
  candidateList: {
    marginTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  candidateRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    border: "1px solid #fde68a",
    borderRadius: 4,
    padding: "6px 8px",
    background: "white",
  } satisfies CSSProperties,
  candidateInfo: { fontSize: 13 } satisfies CSSProperties,
  candidateSub: { color: "#64748b" } satisfies CSSProperties,
  candidateButton: {
    background: "white",
    color: INTAKE_NAVY,
    border: `1px solid ${INTAKE_NAVY}`,
    padding: "4px 10px",
    fontSize: 13,
    borderRadius: 4,
    cursor: "pointer",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  reviewFoot: { marginTop: 8, fontSize: 13 } satisfies CSSProperties,
  forceNewButton: {
    background: "white",
    color: INTAKE_NAVY,
    border: `1px solid ${INTAKE_NAVY}`,
    padding: "4px 10px",
    fontSize: 13,
    borderRadius: 4,
    cursor: "pointer",
    marginTop: 4,
  } satisfies CSSProperties,
  importErrorPanel: {
    margin: "0 0 16px",
    padding: 10,
    border: "1px solid #fca5a5",
    borderRadius: 6,
    background: "#fef2f2",
    fontSize: 13,
  } satisfies CSSProperties,
  importErrorText: { color: "#b91c1c" } satisfies CSSProperties,
  detailError: { color: "#b91c1c", marginBottom: 12 } satisfies CSSProperties,
  backButton: {
    border: `1px solid ${INTAKE_NAVY}`,
    color: INTAKE_NAVY,
    background: "none",
    padding: "6px 14px",
    cursor: "pointer",
    borderRadius: 3,
  } satisfies CSSProperties,
  loadingText: { color: "#64748b" } satisfies CSSProperties,
} as const;
