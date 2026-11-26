/**
 * Intake style tables (phase U4 of docs/ui-overhaul-ab-plan-2026-11-24.md).
 *
 * Same contract as `pos/posStyles.ts` and `components/layoutStyles.ts`: the v1
 * inline objects are kept here verbatim so v1 renders pixel-identically, and v2
 * styling is applied by class name from `intake-v2.css`.
 *
 * Part 1 covers the seller-entry path — `IntakeForm`, `SellerSearch`,
 * `SellerForm`, `ImportItemsButton` and the `IntakeModulePage` chrome.
 * Part 2 covers the item path — `ItemList`, `ItemForm`, `IntakePage` and
 * `ItemSearchPage` — and adopts the shared `TableScroll` pattern from U2.
 *
 * Table mode choice: the two tables whose rows hold many controls or a
 * filter row inside `<thead>` use `scroll` (the wrapper alone stops the page
 * overflowing sideways); the short read-mostly intakes table uses `stack`,
 * where each row becomes a card on a narrow screen. Stacked mode visually
 * hides `<thead>`, so a table with interactive content in its header must
 * NOT use it. Tables that keep their own column widths stay unstacked even
 * inside a `scroll` wrapper — the wrapper is the safety net, not a redesign.
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

/* ── ItemList (part 2) ────────────────────────────────────────────────────── */

/** Inline error line shared by every alert row in the items list. */
const ERROR_LINE: CSSProperties = { color: "red", marginBottom: 8 };

/** Edit-panel input: full width, compact padding, small type. */
const EDITOR_INPUT: CSSProperties = {
  width: "100%",
  padding: "4px 6px",
  boxSizing: "border-box",
  fontSize: 13,
};

/** Edit-panel field label above each control. */
const EDITOR_LABEL: CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#64748b",
  marginBottom: 2,
};

export const ITEM_LIST = {
  errorLine: ERROR_LINE,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  } satisfies CSSProperties,
  title: { margin: 0 } satisfies CSSProperties,
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  } satisfies CSSProperties,
  printerSelect: { fontSize: 13, padding: "4px 6px" } satisfies CSSProperties,
  codeAsTextLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  } satisfies CSSProperties,
  headRow: { borderBottom: "2px solid #ccc" } satisfies CSSProperties,
  thLeft: { textAlign: "left", padding: "4px 8px" } satisfies CSSProperties,
  thRight: { textAlign: "right", padding: "4px 8px" } satisfies CSSProperties,
  /** Open rows drop their bottom border so the panel reads as part of the row. */
  row(expanded: boolean): CSSProperties {
    return { borderBottom: expanded ? "none" : "1px solid #eee" };
  },
  cell: { padding: "4px 8px" } satisfies CSSProperties,
  cellRight: { padding: "4px 8px", textAlign: "right" } satisfies CSSProperties,
  cellNowrap: { padding: "4px 8px", whiteSpace: "nowrap" } satisfies CSSProperties,
  panelCell: {
    padding: "8px 16px 16px",
    background: "#f8fafc",
    borderBottom: "1px solid #eee",
  } satisfies CSSProperties,
  editGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
    marginBottom: 8,
  } satisfies CSSProperties,
  editLabel: EDITOR_LABEL,
  editInput: EDITOR_INPUT,
  noteRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    fontSize: 13,
  } satisfies CSSProperties,
  noteText: { color: "#64748b" } satisfies CSSProperties,
  /** Live "-> 8 on hand (+3)" preview for the `=target` entry mode. */
  notePreview: { color: "#2563eb", fontSize: 12 } satisfies CSSProperties,
  noteLabel: { color: "#64748b" } satisfies CSSProperties,
  qtyInput: { width: 120, padding: "4px 6px", fontSize: 13 } satisfies CSSProperties,
  qtyError: { color: "#ef4444" } satisfies CSSProperties,
  saveError: {
    color: "#ef4444",
    fontSize: 12,
    margin: "0 0 8px",
  } satisfies CSSProperties,
  actionRow: { display: "flex", gap: 8, alignItems: "center" } satisfies CSSProperties,
  saveButton(saving: boolean): CSSProperties {
    return { ...BUTTON_STYLE, cursor: saving ? "default" : "pointer" };
  },
  printInput: { width: 52, marginRight: 2 } satisfies CSSProperties,
  /** Per-row label/print buttons keep a 4px gutter between them. */
  rowButton: { ...BUTTON_STYLE, marginRight: 4 } satisfies CSSProperties,
  /** The panel's Delete sits at the far right, away from Save/Cancel. */
  panelDelete: { ...BUTTON_STYLE, marginLeft: "auto" } satisfies CSSProperties,
  footRow: {
    borderTop: "2px solid #333",
    fontWeight: "bold",
    background: "#f8fafc",
  } satisfies CSSProperties,
  footCell: { padding: "6px 8px" } satisfies CSSProperties,
  footCellRight: { padding: "6px 8px", textAlign: "right" } satisfies CSSProperties,
} as const;

/* ── ItemForm (part 2) ────────────────────────────────────────────────────── */

export const ITEM_FORM = {
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0 12px",
  } satisfies CSSProperties,
  field: { marginBottom: 8 } satisfies CSSProperties,
  label: { display: "block", fontSize: 13, marginBottom: 2 } satisfies CSSProperties,
  /** Text inputs get the border-box fix; selects never needed it in v1. */
  inputBox: {
    width: "100%",
    padding: 5,
    boxSizing: "border-box",
  } satisfies CSSProperties,
  inputPlain: { width: "100%", padding: 5 } satisfies CSSProperties,
  /** Live "12 / 99" counter; turns red at 90+ characters. */
  counter(over: boolean): CSSProperties {
    return {
      textAlign: "right",
      fontSize: 11,
      color: over ? "#ef4444" : "#94a3b8",
      marginTop: 2,
    };
  },
  priceNote: { fontSize: 11, color: "#b45309", marginTop: 2 } satisfies CSSProperties,
  donateRow: {
    marginBottom: 10,
    display: "flex",
    gap: 16,
    alignItems: "flex-start",
  } satisfies CSSProperties,
  inheritNote: { fontSize: 11, color: "#64748b", marginTop: 2 } satisfies CSSProperties,
  error: { color: "red", marginBottom: 8 } satisfies CSSProperties,
} as const;

/* ── IntakePage (part 2) ──────────────────────────────────────────────────── */

export const INTAKE_PAGE = {
  root: { maxWidth: 800 } satisfies CSSProperties,
  heading: { marginBottom: 4 } satisfies CSSProperties,
  breadcrumb: { fontSize: 13, marginBottom: 16, color: "#666" } satisfies CSSProperties,
  /** Clickable breadcrumb step — looks like a link, has no button chrome. */
  crumbLink: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#1a237e",
    padding: 0,
    fontSize: 13,
    textDecoration: "underline",
  } satisfies CSSProperties,
  crumbSep: { margin: "0 6px", color: "#999" } satisfies CSSProperties,
  crumbCurrent: { color: "#333", fontWeight: 600 } satisfies CSSProperties,
  crumbText: { color: "#333" } satisfies CSSProperties,
  sellerHeading: { marginTop: 0 } satisfies CSSProperties,
  sellerCode: {
    fontSize: 14,
    fontWeight: 400,
    marginLeft: 8,
    color: "#666",
  } satisfies CSSProperties,
  errorLine: ERROR_LINE,
  previousNote: { fontWeight: 500, marginBottom: 8 } satisfies CSSProperties,
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginBottom: 16,
  } satisfies CSSProperties,
  headRow: {
    textAlign: "left",
    borderBottom: "2px solid #ccc",
    fontSize: 13,
  } satisfies CSSProperties,
  th: { padding: "4px 8px" } satisfies CSSProperties,
  bodyRow: { borderBottom: "1px solid #eee" } satisfies CSSProperties,
  cell: { padding: "6px 8px" } satisfies CSSProperties,
  empty: { color: "#666" } satisfies CSSProperties,
  itemsMeta: {
    color: "#666",
    fontSize: 13,
    margin: "0 0 8px",
  } satisfies CSSProperties,
  importWrap: { margin: "12px 0" } satisfies CSSProperties,
  divider: { margin: "16px 0" } satisfies CSSProperties,
} as const;

/* ── ItemSearchPage (part 2) ──────────────────────────────────────────────── */

export const SEARCH_PAGE = {
  intro: { fontSize: 13, color: "#555", marginTop: 0 } satisfies CSSProperties,
  form: {
    display: "flex",
    gap: 8,
    alignItems: "end",
    marginBottom: 16,
  } satisfies CSSProperties,
  label: { display: "block", fontSize: 13, marginBottom: 3 } satisfies CSSProperties,
  queryInput: { width: 320, padding: 8 } satisfies CSSProperties,
  statusSelect: { padding: 8 } satisfies CSSProperties,
  formButton: { padding: "8px 20px" } satisfies CSSProperties,
  searching: { color: "#555", marginBottom: 8 } satisfies CSSProperties,
  errorLine: ERROR_LINE,
  foundCount: { marginBottom: 8, fontSize: 14 } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" } satisfies CSSProperties,
  headRow: { borderBottom: "2px solid #ccc" } satisfies CSSProperties,
  bodyRow: { borderBottom: "1px solid #eee" } satisfies CSSProperties,
  cell: { padding: "6px 8px", textAlign: "left" } satisfies CSSProperties,
  /** Filter cells sit under the headers and hug the header rule below them. */
  filterCell: {
    padding: "6px 8px",
    textAlign: "left",
    paddingBottom: 4,
  } satisfies CSSProperties,
  filterInput: {
    width: "100%",
    minWidth: 90,
    padding: "3px 6px",
    fontSize: 12,
  } satisfies CSSProperties,
  noResults: { color: "#555", marginTop: 12 } satisfies CSSProperties,
} as const;
