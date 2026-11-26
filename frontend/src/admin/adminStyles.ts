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
