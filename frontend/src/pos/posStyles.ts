/**
 * POS style tables (phase U3 of docs/ui-overhaul-ab-plan-2026-11-24.md).
 *
 * Same pattern as `components/layoutStyles.ts`: the v1 POS screens are styled
 * with inline `style={{}}` objects and v1 must stay pixel-identical, so those
 * objects live here verbatim instead of being rewritten as CSS. v2 styling is
 * in `pos/pos-v2.css`, applied by class name only.
 *
 * Anything that varies per state (row highlight, sold-out badge, tender colour)
 * is a function returning the v1 object, so the caller passes the same inputs
 * it used to inline and gets the identical result.
 *
 * These are money screens. Every object below is a copy of what the component
 * rendered before U3 — do not "tidy" values, because a changed number here is
 * a visible change to v1.
 */
import type { CSSProperties } from "react";
import { BUTTON_STYLE } from "../lib/buttons";

export { variantProps, v1Only, v2Only } from "../components/layoutStyles";

const NAVY = "#1e3a8a";
const HIGHLIGHT_BG = "#e8eef9";

/** v1 inline styles — LookupField. */
export const LOOKUP = {
  label: {
    fontWeight: 600,
    display: "block",
    marginBottom: 4,
    fontSize: 14,
  } satisfies CSSProperties,

  input: {
    width: "100%",
    padding: 12,
    fontSize: 18,
    boxSizing: "border-box",
    border: `2px solid ${NAVY}`,
    borderRadius: 4,
  } satisfies CSSProperties,

  error: { marginTop: 6 } satisfies CSSProperties,

  /** Results list renders INLINE below the input (event feedback #3). */
  results: {
    marginTop: 6,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 4,
    maxHeight: 320,
    overflowY: "auto",
  } satisfies CSSProperties,

  resultsHead: {
    padding: "7px 12px",
    fontSize: 12,
    color: "#64748b",
    borderBottom: "1px solid #e2e8f0",
    fontWeight: 600,
  } satisfies CSSProperties,

  /** Row button: `highlighted` paints the keyboard-nav background. */
  resultRow: (highlighted: boolean, sellable: boolean): CSSProperties => ({
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "9px 12px",
    background: highlighted ? HIGHLIGHT_BG : "none",
    border: "none",
    borderBottom: "1px solid #f1f5f9",
    cursor: sellable ? "pointer" : "default",
    fontSize: 14,
    textAlign: "left",
    opacity: sellable ? 1 : 0.45,
    pointerEvents: sellable ? "auto" : "none",
  }),

  resultCode: { color: NAVY, marginRight: 8 } satisfies CSSProperties,
  resultDesc: { color: "#374151" } satisfies CSSProperties,
  resultMeta: { marginLeft: 6, fontSize: 12, color: "#94a3b8" } satisfies CSSProperties,
  resultTail: { whiteSpace: "nowrap", marginLeft: 16 } satisfies CSSProperties,
  resultRemaining: { marginRight: 8, fontSize: 12, color: "#64748b" } satisfies CSSProperties,
  resultStatus: {
    marginLeft: 6,
    fontSize: 11,
    color: "#ef4444",
    fontWeight: 700,
    textTransform: "uppercase",
  } satisfies CSSProperties,
} as const;

/** v1 inline styles — Cart. */
export const CART = {
  emptyReserved: { color: "#555", fontStyle: "italic" } satisfies CSSProperties,
  empty: { color: "#888", fontStyle: "italic" } satisfies CSSProperties,
  txnNote: { fontSize: 13, color: "#555", marginBottom: 4 } satisfies CSSProperties,

  table: { width: "100%", borderCollapse: "collapse", marginBottom: 8 } satisfies CSSProperties,
  theadRow: { borderBottom: "2px solid #ccc", fontSize: 13, color: "#555" } satisfies CSSProperties,
  thLeft: { textAlign: "left", padding: "4px 8px" } satisfies CSSProperties,
  thRight: { textAlign: "right", padding: "4px 8px" } satisfies CSSProperties,

  bodyRow: { borderBottom: "1px solid #eee" } satisfies CSSProperties,
  td: { padding: "6px 8px" } satisfies CSSProperties,
  tdRight: { padding: "6px 8px", textAlign: "right" } satisfies CSSProperties,
  itemMeta: { fontSize: 12, color: "#94a3b8" } satisfies CSSProperties,

  qtyInput: { width: 56, padding: "4px 6px", fontSize: 14, textAlign: "right" } satisfies CSSProperties,
  priceInput: { width: 80, padding: "4px 6px", fontSize: 14, textAlign: "right" } satisfies CSSProperties,
  removeBtn: { fontSize: 12, cursor: "pointer" } satisfies CSSProperties,

  noteWrap: { marginBottom: 8 } satisfies CSSProperties,
  noteRow: { marginBottom: 4, fontSize: 13 } satisfies CSSProperties,
  noteLabel: { color: "#64748b" } satisfies CSSProperties,
  noteInput: { marginLeft: 8, padding: "4px 6px", fontSize: 13, width: 220 } satisfies CSSProperties,

  total: { textAlign: "right", fontWeight: "bold", fontSize: 20 } satisfies CSSProperties,
} as const;

/** v1 inline styles — PaymentForm. */
export const PAY = {
  field: { marginBottom: 12 } satisfies CSSProperties,
  label: { display: "block", marginBottom: 4 } satisfies CSSProperties,
  inputMoney: { padding: 8, fontSize: 16, width: 140 } satisfies CSSProperties,
  inputCheckNumber: { padding: 8, fontSize: 16, width: 200 } satisfies CSSProperties,
  notes: {
    width: "100%",
    padding: 8,
    fontSize: 14,
    boxSizing: "border-box",
  } satisfies CSSProperties,
  hint: { fontSize: 12, color: "#64748b", marginTop: 4 } satisfies CSSProperties,
  error: { color: "red", marginBottom: 10 } satisfies CSSProperties,

  /**
   * Tendered-vs-total status box: border/background/text all flip together on
   * whether the tender covers the total. Kept as one function because the
   * three properties must never disagree — a v1 regression here would show a
   * green box with red text.
   */
  status: (covers: boolean): CSSProperties => ({
    marginBottom: 10,
    padding: 8,
    borderRadius: 4,
    fontSize: 14,
    border: covers ? "1px solid #86efac" : "1px solid #fca5a5",
    background: covers ? "#f0fdf4" : "#fef2f2",
    color: covers ? "#166534" : "#b91c1c",
  }),

  changeDue: {
    marginBottom: 10,
    padding: "10px 12px",
    borderRadius: 4,
    fontSize: 17,
    fontWeight: 700,
    border: "1px solid #86efac",
    background: "#f0fdf4",
    color: "#15803d",
  } satisfies CSSProperties,

  actions: { display: "flex", gap: 8, marginTop: 16 } satisfies CSSProperties,
} as const;

/** v1 inline styles — ConfirmationScreen. */
export const CONFIRM = {
  container: { textAlign: "center", padding: 32 } satisfies CSSProperties,
  mark: { fontSize: 48, color: "#2e7d32", marginBottom: 16 } satisfies CSSProperties,
  count: { fontSize: 20 } satisfies CSSProperties,
  total: { fontSize: 28, fontWeight: "bold" } satisfies CSSProperties,
  tenders: { marginBottom: 24, color: "#555", fontSize: 14 } satisfies CSSProperties,
  change: { color: "#2e7d32", fontWeight: "bold" } satisfies CSSProperties,
  newButton: {
    padding: "14px 36px",
    fontSize: 18,
    background: "#1a237e",
    color: "white",
    border: "none",
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;

/** v1 inline styles — TransactionEditor. */
export const EDITOR = {
  loading: { color: "#64748b" } satisfies CSSProperties,
  loadError: { color: "red" } satisfies CSSProperties,

  root: {
    border: "2px solid " + NAVY,
    borderRadius: 6,
    padding: 14,
    marginTop: 8,
    background: "#f8fafc",
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  } satisfies CSSProperties,
  title: { color: NAVY, margin: 0 } satisfies CSSProperties,
  meta: { fontSize: 13, color: "#555", marginBottom: 8 } satisfies CSSProperties,
  error: { color: "red", marginBottom: 8 } satisfies CSSProperties,
  notice: { color: "#166534", marginBottom: 8 } satisfies CSSProperties,

  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginBottom: 4,
  } satisfies CSSProperties,
  theadRow: {
    borderBottom: "2px solid #ccc",
    fontSize: 13,
    color: "#555",
  } satisfies CSSProperties,
  thLeft: { textAlign: "left", padding: "4px 8px" } satisfies CSSProperties,
  thRight: { textAlign: "right", padding: "4px 8px" } satisfies CSSProperties,

  /** Unsaved lines bold their row — the only signal that a PATCH is pending. */
  bodyRow: (dirty: boolean): CSSProperties => ({
    borderBottom: "1px solid #eee",
    fontWeight: dirty ? 700 : 400,
  }),
  td: { padding: "6px 8px" } satisfies CSSProperties,
  tdRight: { padding: "6px 8px", textAlign: "right" } satisfies CSSProperties,

  qtyInput: {
    width: 56,
    padding: "4px 6px",
    fontSize: 14,
    textAlign: "right",
  } satisfies CSSProperties,
  priceInput: {
    width: 80,
    padding: "4px 6px",
    fontSize: 14,
    textAlign: "right",
  } satisfies CSSProperties,
  notesInput: { width: 200, padding: "4px 6px", fontSize: 13 } satisfies CSSProperties,
  removeBtn: { fontSize: 12, cursor: "pointer" } satisfies CSSProperties,

  lineActions: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 12,
  } satisfies CSSProperties,
  pendingTotal: { fontWeight: 700, fontSize: 16 } satisfies CSSProperties,
  smallNote: { fontSize: 13, color: "#555" } satisfies CSSProperties,

  addItem: { marginBottom: 12 } satisfies CSSProperties,
  addItemLabel: { fontWeight: 600, marginBottom: 4 } satisfies CSSProperties,

  fieldset: {
    border: "1px solid #e2e8f0",
    borderRadius: 4,
    padding: 10,
    marginBottom: 12,
  } satisfies CSSProperties,
  legend: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  fieldRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 8,
  } satisfies CSSProperties,
  fieldLabel: { fontSize: 13 } satisfies CSSProperties,

  /** Payment/detail inputs differ only by width, so the width is the argument. */
  fieldInput: (width: number): CSSProperties => ({
    display: "block",
    width,
    padding: "4px 6px",
  }),
  cardFeeNote: { fontSize: 12, color: "#555", marginBottom: 8 } satisfies CSSProperties,

  historyLabel: { fontWeight: 600, marginBottom: 4 } satisfies CSSProperties,
  historyEmpty: {
    color: "#888",
    fontStyle: "italic",
    fontSize: 13,
  } satisfies CSSProperties,
  historyList: { margin: 0, paddingLeft: 16, fontSize: 13 } satisfies CSSProperties,
  historyDetail: { color: "#64748b" } satisfies CSSProperties,
} as const;

/** v1 inline styles — POSPage chrome (banners, panels, transactions list). */
export const POS_PAGE = {
  root: { maxWidth: 900 } satisfies CSSProperties,

  /* Completed-sale banner */
  successBanner: {
    border: "2px solid #2e7d32",
    borderRadius: 6,
    padding: 16,
    marginBottom: 16,
    background: "#f0fdf4",
  } satisfies CSSProperties,
  successTitle: {
    fontSize: 22,
    color: "#2e7d32",
    fontWeight: 700,
    marginBottom: 4,
  } satisfies CSSProperties,
  successLine: { fontSize: 16 } satisfies CSSProperties,
  successMetaTop: { fontSize: 13, color: "#555", marginTop: 2 } satisfies CSSProperties,
  successMeta: { fontSize: 13, color: "#555", marginTop: 4 } satisfies CSSProperties,
  successNewButton: { ...BUTTON_STYLE, marginTop: 12 } satisfies CSSProperties,

  /* Submission error banner (#14: must be above the payment form) */
  errorBanner: {
    color: "red",
    border: "2px solid red",
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
    background: "#fef2f2",
    fontWeight: 600,
  } satisfies CSSProperties,

  cartWrap: { margin: "16px 0" } satisfies CSSProperties,
  checkoutRow: {
    display: "flex",
    gap: 24,
    alignItems: "flex-start",
  } satisfies CSSProperties,
  checkoutCol: { minWidth: 320 } satisfies CSSProperties,
  squarePanel: {
    marginBottom: 16,
    padding: 12,
    border: "1px solid #ccc",
    borderRadius: 4,
  } satisfies CSSProperties,
  squareTitle: { margin: "0 0 8px" } satisfies CSSProperties,

  /* My Transactions */
  historySection: { marginTop: 24 } satisfies CSSProperties,
  historyBody: { marginTop: 12 } satisfies CSSProperties,
  historyEmpty: { color: "#888", fontStyle: "italic" } satisfies CSSProperties,
  historyError: { color: "red" } satisfies CSSProperties,

  saleCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    marginBottom: 8,
    padding: 10,
  } satisfies CSSProperties,
  saleHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
  } satisfies CSSProperties,
  saleTitle: { fontWeight: 600 } satisfies CSSProperties,
  saleBody: { marginTop: 8, fontSize: 13 } satisfies CSSProperties,
  editRow: { marginBottom: 8 } satisfies CSSProperties,
  editButton: { ...BUTTON_STYLE, fontSize: 13 } satisfies CSSProperties,
  editHint: { color: "#64748b", marginLeft: 8, fontSize: 12 } satisfies CSSProperties,
  payLine: { marginTop: 4 } satisfies CSSProperties,

  itemsTable: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 6,
  } satisfies CSSProperties,
  itemsHeadRow: { borderBottom: "1px solid #ccc" } satisfies CSSProperties,
  itemsBodyRow: { borderBottom: "1px solid #eee" } satisfies CSSProperties,
  itemsThLeft: { textAlign: "left", padding: "2px 6px" } satisfies CSSProperties,
  itemsThRight: { textAlign: "right", padding: "2px 6px" } satisfies CSSProperties,
  itemsTd: { padding: "4px 6px" } satisfies CSSProperties,
  itemsTdRight: { padding: "4px 6px", textAlign: "right" } satisfies CSSProperties,
  itemNote: { fontSize: 11, color: "#64748b", marginTop: 2 } satisfies CSSProperties,
} as const;
