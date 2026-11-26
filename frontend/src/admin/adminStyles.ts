/**
 * v1 inline-style tables for the admin reporting half, preserved verbatim.
 *
 * Same contract as `posStyles.ts` and `intakeStyles.ts`: every object here is
 * the exact inline style the component used before the v2 migration, so
 * `variantProps`/`v1Only` can keep v1 pixel-identical while v2 reads its look
 * from `admin-v2.css`.
 *
 * Two families of style live here, and they are NOT interchangeable:
 *
 *  - **Key/value ("kv") tables** are two columns wide (label + value) and carry
 *    `width: "auto"` because `index.css` has a global `table { width: 100% }`
 *    that would otherwise stretch a summary across the whole page. That inline
 *    `width:auto` is load-bearing — four existing tests assert it — so kv
 *    tables are **never** wrapped in `TableScroll`: that wrapper's CSS forces
 *    `width: 100%` on its child table, which is exactly what the inline style
 *    exists to prevent.
 *  - **Data tables** have 8–10 columns of currency and use `TableScroll` in
 *    scroll mode, so they become full-width in v2 (correct for that shape) and
 *    can be scrolled sideways instead of stacking ten money columns into cards.
 *
 * @module adminStyles
 */
import type { CSSProperties } from "react";
import { BUTTON_STYLE } from "../lib/buttons";

export { variantProps, v1Only, v2Only } from "../components/layoutStyles";

/** Admin pages use the darker `#1a237e` navy, not the `#1e3a8a` shell navy. */
export const ADMIN_NAVY = "#1a237e";
/** Muted secondary text used across every report. */
export const MUTED = "#64748b";
/** Error red used by the report panels' inline error lines. */
export const ERROR_RED = "#ef4444";

/* ── Shared pieces ───────────────────────────────────────────────────────── */

/** The "Download CSV/XLSX/PDF/ZIP" outline button, repeated 7× in ReportsPage. */
export const OUTLINE_BUTTON = {
  border: `1px solid ${ADMIN_NAVY}`,
  color: ADMIN_NAVY,
  background: "none",
  padding: "3px 10px",
  cursor: "pointer",
  borderRadius: 3,
  fontSize: 13,
} satisfies CSSProperties;

/** `<section>` wrapper spacing in ReportsPage (every report is one section). */
export const REPORT_SECTION = { marginBottom: 32 } satisfies CSSProperties;

/** Muted 13px line: loading, empty states, and collapsed-section summaries. */
export const MUTED_LINE = { color: MUTED, fontSize: 13 } satisfies CSSProperties;

/** Error line inside a report panel. */
export const ERROR_LINE = { color: ERROR_RED, fontSize: 13 } satisfies CSSProperties;

/** Collapsible section header: chevron + h3 + summary, with a CSV button. */
export const SECTION_HEADER = {
  row(open: boolean): CSSProperties {
    return {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: open ? 12 : 0,
    };
  },
  /** Header rows without a collapse toggle (Vendor/Non-Vendor workbooks). */
  staticRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  } satisfies CSSProperties,
  clickable: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    flex: 1,
  } satisfies CSSProperties,
  chevron: { color: ADMIN_NAVY, fontSize: 11, userSelect: "none" } satisfies CSSProperties,
  title: { margin: 0 } satisfies CSSProperties,
  summary: MUTED_LINE,
  /** A cashier heading: navy name + muted counts inline. */
  cashier: { color: ADMIN_NAVY } satisfies CSSProperties,
  cashierMeta: {
    color: MUTED,
    fontSize: 13,
    fontWeight: 400,
    marginLeft: 8,
  } satisfies CSSProperties,
} as const;

/* ── Table primitives (shared by every report table) ─────────────────────── */

/**
 * Header/cell geometry.
 *
 * `thCell(align)` mirrors the three literal variants the reports used
 * (`textAlign: left|right|center, padding: "4px 8px"`); `cell`, `cellRight` and
 * `cellCenter` are the matching `td` forms.
 */
export const TABLE = {
  /** Data tables spanning the panel. */
  table: { width: "100%", borderCollapse: "collapse" } satisfies CSSProperties,
  tableSpaced: {
    width: "100%",
    borderCollapse: "collapse",
    marginBottom: 8,
  } satisfies CSSProperties,
  /** Key/value and summary tables — see the module docstring before changing. */
  kvTable: { width: "auto", borderCollapse: "collapse" } satisfies CSSProperties,
  kvTableSpaced: {
    width: "auto",
    borderCollapse: "collapse",
    marginBottom: 16,
  } satisfies CSSProperties,
  headRow: { borderBottom: "2px solid #ccc" } satisfies CSSProperties,
  bodyRow: { borderBottom: "1px solid #eee" } satisfies CSSProperties,
  /** Voided sales stay in the table but recede. */
  bodyRowVoided: {
    borderBottom: "1px solid #eee",
    background: "#fafafa",
  } satisfies CSSProperties,
  /** ITEMS rows whose every unit is sold grey out. */
  bodyRowSoldOut: {
    borderBottom: "1px solid #eee",
    color: MUTED,
  } satisfies CSSProperties,
  totalsRow: { borderTop: "2px solid #ccc", fontWeight: "bold" } satisfies CSSProperties,
  thLeft: { textAlign: "left", padding: "4px 8px" } satisfies CSSProperties,
  thRight: { textAlign: "right", padding: "4px 8px" } satisfies CSSProperties,
  thCenter: { textAlign: "center", padding: "4px 8px" } satisfies CSSProperties,
  cell: { padding: "4px 8px" } satisfies CSSProperties,
  cellRight: { padding: "4px 8px", textAlign: "right" } satisfies CSSProperties,
  cellCenter: { padding: "4px 8px", textAlign: "center" } satisfies CSSProperties,
  /** 12px compact geometry for the payout detail tables. */
  thCompact: { textAlign: "left", padding: "4px 8px", fontSize: 12 } satisfies CSSProperties,
  cellCompact: { padding: "4px 8px", fontSize: 12 } satisfies CSSProperties,
  cellCompactRight: {
    padding: "4px 8px",
    textAlign: "right",
    fontSize: 12,
  } satisfies CSSProperties,
  /** Key/value rows: bold label with a wide right gutter. */
  kvLabel: { padding: "4px 16px 4px 8px", fontWeight: "bold" } satisfies CSSProperties,
  kvLabelSm: {
    padding: "3px 16px 3px 8px",
    fontWeight: "bold",
    fontSize: 12,
  } satisfies CSSProperties,
  kvLabel13: {
    padding: "4px 16px 4px 8px",
    fontWeight: "bold",
    fontSize: 13,
  } satisfies CSSProperties,
  kvLabelWide: { padding: "4px 24px 4px 8px", fontWeight: "bold" } satisfies CSSProperties,
  kvValue: { padding: "3px 8px", fontSize: 12 } satisfies CSSProperties,
  kvValueRight: { padding: "4px 8px", textAlign: "right", fontSize: 13 } satisfies CSSProperties,
} as const;

/* ── Per-file tables ────────────────────────────────────────────────────── */

/**
 * `frontend/src/admin/ReportsPage.tsx` — the largest single consumer.
 *
 * `row(isVoided)` and `itemName(item)` replace the two ternaries that were
 * inline; everything else is a straight lift.
 */
export const REPORTS = {
  section: REPORT_SECTION,
  ...SECTION_HEADER,
  outlineButton: OUTLINE_BUTTON,
  /* Donations / Unsold item labels: name + muted code. */
  itemName: { fontWeight: 500 } satisfies CSSProperties,
  itemCode: { color: MUTED, fontSize: 12, marginLeft: 4 } satisfies CSSProperties,
  /** Transactions-by-user: one block per cashier. */
  cashierBlock: { marginBottom: 24 } satisfies CSSProperties,
  cashierHeading: { margin: "12px 0 6px" } satisfies CSSProperties,
  /** Due Seller lookup form. */
  lookupForm: {
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
    marginBottom: 16,
  } satisfies CSSProperties,
  lookupField: { flex: 1 } satisfies CSSProperties,
  lookupLabel: { display: "block", fontSize: 13, marginBottom: 3 } satisfies CSSProperties,
  /** The "All Due Sellers" panel. */
  generateAllPanel: {
    border: `2px solid ${ADMIN_NAVY}`,
    borderRadius: 6,
    padding: 12,
  } satisfies CSSProperties,
  generateAllHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  } satisfies CSSProperties,
  generateAllTitle: { margin: 0 } satisfies CSSProperties,
  actionRow: { display: "flex", gap: 8 } satisfies CSSProperties,
  sellerBlock: { marginBottom: 24 } satisfies CSSProperties,
} as const;

/** `frontend/src/admin/SellerPayoutPanel.tsx` — four tables + status lines. */
export const PAYOUT = {
  loading: MUTED_LINE,
  error: ERROR_LINE,
  kvTable: TABLE.kvTableSpaced,
  dataTable: {
    width: "100%",
    borderCollapse: "collapse",
    marginBottom: 16,
  } satisfies CSSProperties,
  headRow: TABLE.headRow,
  bodyRow: TABLE.bodyRow,
  /** Rows for fully-sold items recede. */
  bodyRowSoldOut: TABLE.bodyRowSoldOut,
  totalsRow: { fontWeight: "bold", borderTop: "2px solid #ccc" } satisfies CSSProperties,
  thCompact: TABLE.thCompact,
  cellCompact: TABLE.cellCompact,
  cellCompactRight: TABLE.cellCompactRight,
  kvLabelSm: TABLE.kvLabelSm,
  kvValue: TABLE.kvValue,
  kvLabel13: TABLE.kvLabel13,
  kvValueRight: TABLE.kvValueRight,
  sectionTitle: { margin: "0 0 4px" } satisfies CSSProperties,
  emptyLine: { color: MUTED, fontSize: 13, marginBottom: 16 } satisfies CSSProperties,
  priceAdj: { fontSize: 11, color: MUTED, marginTop: 2 } satisfies CSSProperties,
  /** Numeric column set — decides alignment for the two data tables.
   *  Typed `readonly string[]` (not `as const`) because `.includes(h)` is
   *  called with the full header union, which a literal tuple type rejects. */
  itemsNumericColumns: ["Sell Price", "Quantity", "Remaining"] as readonly string[],
  salesNumericColumns: [
    "Qty",
    "Sell Price",
    "Extended",
    "Due Seller",
    "Rate",
  ] as readonly string[],
} as const;

/** `frontend/src/admin/AllSellersPayouts.tsx`. */
export const ALL_SELLERS = {
  loading: MUTED_LINE,
  error: ERROR_LINE,
  outlineButton: OUTLINE_BUTTON,
  zipRow: { display: "flex", justifyContent: "flex-end", marginBottom: 8 } satisfies CSSProperties,
  kvTable: TABLE.kvTableSpaced,
  bodyRow: TABLE.bodyRow,
  kvLabel13: TABLE.kvLabel13,
  kvValueRight: TABLE.kvValueRight,
  /** One bordered card per seller. */
  sellerCard: {
    marginBottom: 24,
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    padding: 12,
  } satisfies CSSProperties,
  sellerHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  } satisfies CSSProperties,
  sellerTitle: { margin: 0 } satisfies CSSProperties,
  sellerMeta: { fontWeight: "normal", fontSize: 13, marginLeft: 8 } satisfies CSSProperties,
  actionRow: { display: "flex", gap: 8 } satisfies CSSProperties,
} as const;

/** `frontend/src/admin/EndOfDayPage.tsx`. */
export const END_OF_DAY = {
  root: { maxWidth: 600 } satisfies CSSProperties,
  /** Grey panels hold both the summary and the backup block. */
  panel: { marginBottom: 24, padding: 16, background: "#f5f5f5", borderRadius: 4 } satisfies CSSProperties,
  panelLast: { padding: 16, background: "#f5f5f5", borderRadius: 4 } satisfies CSSProperties,
  title: { margin: "0 0 12px" } satisfies CSSProperties,
  titleTight: { margin: "0 0 8px" } satisfies CSSProperties,
  kvTable: TABLE.kvTable,
  /** `#ddd` here, not the `#eee` used elsewhere — preserved deliberately. */
  kvRow: { borderBottom: "1px solid #ddd" } satisfies CSSProperties,
  kvLabelWide: TABLE.kvLabelWide,
  kvValue: TABLE.cell,
  buttonRow: { display: "flex", gap: 8, marginTop: 12 } satisfies CSSProperties,
  hint: { fontSize: 14, color: "#555", marginBottom: 12 } satisfies CSSProperties,
  button: BUTTON_STYLE,
} as const;

/** `frontend/src/admin/SellerEquipmentSummaryPanel.tsx`. */
export const EQUIPMENT = {
  button: BUTTON_STYLE,
  error: { color: "red", marginTop: 8 } satisfies CSSProperties,
  table: { width: "auto", borderCollapse: "collapse", marginTop: 8 } satisfies CSSProperties,
  headRow: { borderBottom: "1px solid #ccc" } satisfies CSSProperties,
  bodyRow: TABLE.bodyRow,
  totalsRow: { fontWeight: 700, borderTop: "1px solid #ccc" } satisfies CSSProperties,
  th: TABLE.thCompact,
  cellCompact: TABLE.cellCompact,
  cellCompactRight: TABLE.cellCompactRight,
} as const;

/* ── U5 part 2: sellers & settings ───────────────────────────────────────── */

/**
 * `frontend/src/admin/AdminPage.tsx` — the tab strip. Note the tab geometry is
 * the only place the admin navy appears as a filled background.
 */
export const ADMIN_TABS = {
  bar: {
    display: "flex",
    gap: 4,
    marginBottom: 16,
    borderBottom: `2px solid ${ADMIN_NAVY}`,
    paddingBottom: 8,
  } satisfies CSSProperties,
  /** Active tabs fill with navy and go white-on-navy; inactive stay outline. */
  tab: (active: boolean) =>
    ({
      padding: "6px 16px",
      background: active ? ADMIN_NAVY : "transparent",
      color: active ? "white" : ADMIN_NAVY,
      border: `1px solid ${ADMIN_NAVY}`,
      cursor: "pointer",
    }) satisfies CSSProperties,
  sectionError: { color: "#b91c1c", marginBottom: 12 } satisfies CSSProperties,
  backButton: {
    border: "1px solid #1e3a8a",
    color: "#1e3a8a",
    background: "none",
    padding: "6px 14px",
    cursor: "pointer",
    borderRadius: 3,
  } satisfies CSSProperties,
  loading: { color: MUTED } satisfies CSSProperties,
} as const;

/** Shared form geometry for `EventSetup` and `UserManagement`. */
const GRID_FORM = {
  display: "grid",
  gap: 8,
  alignItems: "end",
} satisfies CSSProperties;

const GRID_LABEL = {
  display: "block",
  fontSize: 13,
  marginBottom: 3,
} satisfies CSSProperties;

const GRID_INPUT = {
  width: "100%",
  padding: 6,
  boxSizing: "border-box",
} satisfies CSSProperties;

const FORM_ERROR = { color: "red", marginTop: 8 } satisfies CSSProperties;

/**
 * `frontend/src/admin/EventSetup.tsx`. Its table body cells use 6px vertical
 * padding, unlike the report tables' 4px — preserved.
 */
export const EVENT_SETUP = {
  table: { width: "100%", borderCollapse: "collapse", marginBottom: 24 } satisfies CSSProperties,
  headRow: { borderBottom: "2px solid #ccc" } satisfies CSSProperties,
  bodyRow: TABLE.bodyRow,
  th: TABLE.thLeft,
  cell: TABLE.cellCompact,
  actionCell: TABLE.cellCompact,
  button: BUTTON_STYLE,
  form: { ...GRID_FORM, gridTemplateColumns: "1fr 1fr 1fr 1fr auto" } satisfies CSSProperties,
  field: {} satisfies CSSProperties,
  label: GRID_LABEL,
  input: GRID_INPUT,
  submit: BUTTON_STYLE,
  error: FORM_ERROR,
} as const;

/** `frontend/src/admin/UserManagement.tsx`. */
export const USER_MANAGEMENT = {
  table: { width: "100%", borderCollapse: "collapse", marginBottom: 24 } satisfies CSSProperties,
  headRow: { borderBottom: "2px solid #ccc" } satisfies CSSProperties,
  bodyRow: TABLE.bodyRow,
  th: TABLE.thLeft,
  cell: TABLE.cellCompact,
  actionCell: { padding: "6px 8px", whiteSpace: "nowrap" } satisfies CSSProperties,
  button: BUTTON_STYLE,
  buttonSpaced: { ...BUTTON_STYLE, marginRight: 6 } satisfies CSSProperties,
  form: { ...GRID_FORM, gridTemplateColumns: "1fr 1fr 1fr auto" } satisfies CSSProperties,
  field: {} satisfies CSSProperties,
  label: GRID_LABEL,
  input: GRID_INPUT,
  passwordRow: { display: "flex", gap: 6 } satisfies CSSProperties,
  passwordInput: { flex: 1, padding: 6, boxSizing: "border-box" } satisfies CSSProperties,
  smallButton: { padding: "6px 10px" } satisfies CSSProperties,
  select: { width: "100%", padding: 6 } satisfies CSSProperties,
  submit: BUTTON_STYLE,
  error: FORM_ERROR,
} as const;

/** `frontend/src/admin/SessionsPanel.tsx`. Its table is auto-width (see the
 *  module docstring) and its error red is `#b00020`, not the report `#ef4444`. */
export const SESSIONS = {
  hint: { color: "#555", marginTop: 0 } satisfies CSSProperties,
  error: { color: "#b00020" } satisfies CSSProperties,
  table: { width: "auto", borderCollapse: "collapse", marginBottom: 24 } satisfies CSSProperties,
  headRow: { borderBottom: "2px solid #ccc" } satisfies CSSProperties,
  bodyRow: TABLE.bodyRow,
  th: TABLE.thLeft,
  cell: { padding: "6px 8px" } satisfies CSSProperties,
  deviceCell: {
    padding: "6px 8px",
    maxWidth: 260,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  actionCell: { padding: "6px 8px", whiteSpace: "nowrap" } satisfies CSSProperties,
  button: BUTTON_STYLE,
  buttonSpaced: { ...BUTTON_STYLE, marginRight: 6 } satisfies CSSProperties,
  emptyCell: { padding: "12px 8px", color: "#777" } satisfies CSSProperties,
  footer: { color: "#777", fontSize: 13 } satisfies CSSProperties,
} as const;

/** `frontend/src/admin/SellerListPage.tsx`. */
export const SELLER_LIST = {
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  } satisfies CSSProperties,
  heading: { margin: 0 } satisfies CSSProperties,
  search: {
    width: "100%",
    padding: "8px 10px",
    marginBottom: 12,
    border: "1px solid #1e3a8a",
    borderRadius: 4,
    boxSizing: "border-box",
  } satisfies CSSProperties,
  error: { color: "red", marginBottom: 12 } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" } satisfies CSSProperties,
  headRow: { borderBottom: "2px solid #e2e8f0" } satisfies CSSProperties,
  th: { textAlign: "left", padding: "6px 10px", fontSize: 13 } satisfies CSSProperties,
  /** Open payout panels close their row's rule so the two read as one block. */
  row: (expanded: boolean) =>
    ({
      borderBottom: expanded ? "none" : "1px solid #f1f5f9",
    }) satisfies CSSProperties,
  cell: { padding: "8px 10px" } satisfies CSSProperties,
  codeCell: { padding: "8px 10px", fontWeight: 600, color: "#1e3a8a" } satisfies CSSProperties,
  mutedCell: { padding: "8px 10px", color: MUTED } satisfies CSSProperties,
  actionCell: { padding: "8px 10px" } satisfies CSSProperties,
  actionGroup: { display: "flex", gap: 4 } satisfies CSSProperties,
  /** Vendor ✓/— and label-progress badges share this geometry. */
  badge: (color: string) =>
    ({
      color,
      fontWeight: 600,
      fontSize: 13,
      whiteSpace: "nowrap",
    }) satisfies CSSProperties,
  payoutCell: {
    padding: "8px 16px 16px",
    background: "#f8fafc",
    borderBottom: "1px solid #f1f5f9",
  } satisfies CSSProperties,
  payoutTitle: { fontSize: 13, display: "block", marginBottom: 8 } satisfies CSSProperties,
  emptyCell: { padding: 16, textAlign: "center", color: "#94a3b8" } satisfies CSSProperties,
  button: BUTTON_STYLE,
} as const;

/** `frontend/src/admin/TransactionsPage.tsx`. */
export const TRANSACTIONS = {
  root: { maxWidth: 900 } satisfies CSSProperties,
  filterBar: {
    display: "flex",
    gap: 12,
    alignItems: "flex-end",
    marginBottom: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  filterLabel: { fontSize: 13 } satisfies CSSProperties,
  filterInput: { display: "block", width: 160, padding: "4px 6px" } satisfies CSSProperties,
  checkLabel: {
    fontSize: 13,
    display: "flex",
    gap: 6,
    alignItems: "center",
  } satisfies CSSProperties,
  loading: { color: MUTED } satisfies CSSProperties,
  error: { color: "red", marginBottom: 10 } satisfies CSSProperties,
  empty: { color: "#888", fontStyle: "italic" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" } satisfies CSSProperties,
  headRow: {
    borderBottom: "2px solid #ccc",
    fontSize: 13,
    color: "#555",
  } satisfies CSSProperties,
  th: TABLE.thLeft,
  thRight: TABLE.thRight,
  row: (voided: boolean) =>
    ({
      borderBottom: "1px solid #eee",
      color: voided ? "#9ca3af" : undefined,
    }) satisfies CSSProperties,
  cell: TABLE.cellCompact,
  cellRight: { padding: "6px 8px", textAlign: "right" } satisfies CSSProperties,
  idCell: { padding: "6px 8px", fontWeight: 600 } satisfies CSSProperties,
  actionCell: TABLE.cellCompact,
  /** VOIDED red vs OK green — the status column's whole signal. */
  statusCell: (voided: boolean) =>
    ({
      padding: "6px 8px",
      color: voided ? "#b91c1c" : "#15803d",
    }) satisfies CSSProperties,
  smallButton: { ...BUTTON_STYLE, padding: "4px 12px", fontSize: 13 } satisfies CSSProperties,
  pager: { display: "flex", gap: 8, marginTop: 12 } satisfies CSSProperties,
  pagerButton: BUTTON_STYLE,
} as const;

/** `frontend/src/admin/SellerDetailPage.tsx` — the largest of the nine. */
export const SELLER_DETAIL = {
  backRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  } satisfies CSSProperties,
  backButton: {
    border: "none",
    background: "none",
    color: "#1e3a8a",
    cursor: "pointer",
    fontSize: 14,
  } satisfies CSSProperties,
  heading: { margin: 0 } satisfies CSSProperties,
  code: { color: "#1e3a8a", marginRight: 8 } satisfies CSSProperties,
  headingMeta: { color: MUTED, fontWeight: 400, marginLeft: 8 } satisfies CSSProperties,
  contactCard: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    padding: 16,
    marginBottom: 20,
  } satisfies CSSProperties,
  contactRow: { marginBottom: 4 } satisfies CSSProperties,
  contactLabel: { color: MUTED, fontSize: 13, marginRight: 6 } satisfies CSSProperties,
  outlineButton: {
    marginTop: 8,
    border: "1px solid #1e3a8a",
    color: "#1e3a8a",
    background: "none",
    padding: "4px 12px",
    cursor: "pointer",
    borderRadius: 3,
  } satisfies CSSProperties,
  vendorToggle: { display: "block", marginBottom: 8, fontSize: 13 } satisfies CSSProperties,
  vendorWarning: { fontSize: 12, color: "#b45309", marginBottom: 8 } satisfies CSSProperties,
  field: { marginBottom: 8 } satisfies CSSProperties,
  fieldLabel: { display: "block", fontSize: 12, color: MUTED, marginBottom: 2 } satisfies CSSProperties,
  fieldInput: { width: "100%", padding: "5px 8px", boxSizing: "border-box" } satisfies CSSProperties,
  addressFieldset: {
    border: "1px solid #e2e8f0",
    borderRadius: 4,
    padding: "10px 12px",
    marginBottom: 8,
  } satisfies CSSProperties,
  legend: { fontSize: 12, color: MUTED } satisfies CSSProperties,
  error: { color: "red", marginBottom: 8, fontSize: 13 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, marginTop: 8 } satisfies CSSProperties,
  saveButton: {
    background: "#1e3a8a",
    color: "#fff",
    border: "none",
    padding: "5px 14px",
    cursor: "pointer",
    borderRadius: 3,
  } satisfies CSSProperties,
  cancelButton: {
    border: "1px solid #94a3b8",
    background: "none",
    padding: "5px 14px",
    cursor: "pointer",
    borderRadius: 3,
  } satisfies CSSProperties,
  itemsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  } satisfies CSSProperties,
  itemsTitle: { margin: 0 } satisfies CSSProperties,
  itemsActions: { display: "flex", gap: 8 } satisfies CSSProperties,
  smallOutline: {
    border: "1px solid #1e3a8a",
    color: "#1e3a8a",
    background: "none",
    padding: "4px 10px",
    cursor: "pointer",
    borderRadius: 3,
    fontSize: 13,
  } satisfies CSSProperties,
  smallOutlineDisabled: {
    border: "1px solid #1e3a8a",
    color: "#1e3a8a",
    background: "none",
    padding: "4px 10px",
    cursor: "not-allowed",
    borderRadius: 3,
    fontSize: 13,
  } satisfies CSSProperties,
  smallPrimary: {
    background: "#1e3a8a",
    color: "#fff",
    border: "none",
    padding: "4px 10px",
    cursor: "pointer",
    borderRadius: 3,
    fontSize: 13,
  } satisfies CSSProperties,
  hiddenFile: { display: "none" } satisfies CSSProperties,
  codeToggle: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 13,
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  importError: { color: "#b91c1c", marginBottom: 12, fontSize: 13 } satisfies CSSProperties,
  reprintOk: { color: "#1a7f37", marginBottom: 8, fontSize: 13 } satisfies CSSProperties,
  addItemPanel: {
    marginBottom: 16,
    padding: 16,
    border: "1px solid #e2e8f0",
    borderRadius: 6,
  } satisfies CSSProperties,
  addItemCancel: {
    float: "right",
    border: "none",
    background: "none",
    cursor: "pointer",
    color: MUTED,
  } satisfies CSSProperties,
  noItems: { color: "#94a3b8", padding: 8 } satisfies CSSProperties,
  intakeGroup: { marginBottom: 24 } satisfies CSSProperties,
  intakeHeading: {
    margin: "0 0 6px",
    fontSize: 12,
    fontWeight: 600,
    color: MUTED,
  } satisfies CSSProperties,
  panel: {
    marginTop: 16,
    padding: 16,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 6,
  } satisfies CSSProperties,
  panelTitle: { fontSize: 13, display: "block", marginBottom: 8 } satisfies CSSProperties,
} as const;

/** `frontend/src/admin/ResetPasswordModal.tsx`. */
export const RESET_PASSWORD = {
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
  label: { display: "block", fontSize: 13, marginBottom: 3 } satisfies CSSProperties,
  passwordRow: { display: "flex", gap: 6 } satisfies CSSProperties,
  passwordInput: { flex: 1, padding: 8, boxSizing: "border-box" } satisfies CSSProperties,
  confirmInput: { width: "100%", padding: 8, boxSizing: "border-box" } satisfies CSSProperties,
  mismatch: { color: "#ef4444", fontSize: 12, marginTop: 4 } satisfies CSSProperties,
  policyList: {
    fontSize: 12,
    color: MUTED,
    margin: "0 0 12px",
    paddingLeft: 20,
  } satisfies CSSProperties,
  /** Unsatisfied rules stay red; the satisfied summary goes green. */
  unmet: { color: "#ef4444" } satisfies CSSProperties,
  met: { color: "#16a34a" } satisfies CSSProperties,
  error: { color: "#ef4444", marginBottom: 10 } satisfies CSSProperties,
  footer: { display: "flex", gap: 8, justifyContent: "flex-end" } satisfies CSSProperties,
  button: BUTTON_STYLE,
} as const;

/** `frontend/src/admin/CreatedUserModal.tsx`. */
export const CREATED_USER = {
  backdrop: RESET_PASSWORD.backdrop,
  panel: {
    background: "#fff",
    borderRadius: 6,
    padding: 24,
    width: 380,
    boxSizing: "border-box",
  } satisfies CSSProperties,
  title: { marginTop: 0 } satisfies CSSProperties,
  hint: { fontSize: 13, color: MUTED, marginTop: 0 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 } satisfies CSSProperties,
  rowLabel: { fontSize: 13, width: 80 } satisfies CSSProperties,
  valueBox: {
    flex: 1,
    padding: "8px 10px",
    background: "#f1f5f9",
    borderRadius: 4,
    fontFamily: "monospace",
    fontSize: 14,
    userSelect: "all",
  } satisfies CSSProperties,
  error: { color: "#ef4444", fontSize: 12, marginBottom: 8 } satisfies CSSProperties,
  footer: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 } satisfies CSSProperties,
  button: BUTTON_STYLE,
} as const;
