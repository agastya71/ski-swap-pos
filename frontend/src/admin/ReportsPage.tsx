/**
 * Admin reports page — aggregates and displays four end-of-event reports:
 * Event Revenue, Donations, Unsold Items, and the per-seller Due Seller report. The first
 * three sections are collapsed by default showing only totals; clicking the
 * section heading expands the full table. Download CSV is always accessible.
 * Due Seller section remains always visible with a seller-lookup form.
 *
 * Each report is its own component below so that no single function carries the
 * whole page's branching — the sections share only `SectionHeader` and the
 * `adminStyles` tables.
 */

import { useState, useEffect, type ReactNode, type FormEvent } from "react";
import {
  getEventRevenue,
  getDonations,
  getUnsoldItems,
  getTransactionsByUser,
  getCheckTransactions,
  downloadFile,
} from "../api/reports";
import type {
  EventRevenueReport,
  DonationsReport,
  UnsoldItemsReport,
  TransactionsByUserReport,
  CheckTransactionsReport,
  Seller,
} from "../types";
import { SellerCombobox } from "../components/SellerCombobox";
import { SellerPayoutPanel } from "./SellerPayoutPanel";
import { AllSellersPayouts } from "./AllSellersPayouts";
import { useUiVariant } from "../lib/uiVariant";
import {
  variantProps,
  v1Only,
  REPORTS as V1_REPORTS,
  TABLE as V1_TABLE,
  MUTED_LINE as V1_MUTED_LINE,
} from "./adminStyles";

/** Display name for a seller, matching the rest of the app (individuals use
 *  first/last name; vendors use company; fall back to the code if neither). */
function sellerDisplayName(s: Seller): string {
  if (s.is_vendor) return s.company ?? s.code;
  const name = `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim();
  return name || s.code;
}

/* ── Shared section header ──────────────────────────────────────────────── */

/**
 * One report heading: optional collapse toggle on the left, one action button
 * on the right. The chevron and the whole left side are clickable, which is how
 * the tests drive it (`getByRole('heading')` bubbles to this div).
 */
function SectionHeader({
  v2,
  open,
  sparse,
  title,
  summary,
  onToggle,
  action,
}: {
  v2: boolean;
  open: boolean;
  /** Drop the bottom gutter when open (workbook sections have no body table). */
  sparse: boolean;
  title: string;
  summary?: ReactNode;
  onToggle?: () => void;
  action: ReactNode;
}) {
  const rowClass = sparse
    ? "ui2-section-row"
    : `ui2-section-row${open ? " ui2-section-row--open" : ""}`;
  const rowStyle = sparse
    ? V1_REPORTS.staticRow
    : V1_REPORTS.row(!sparse && open);
  const left = (
    <>
      <span {...variantProps(v2, "ui2-section-chevron", V1_REPORTS.chevron)}>
        {open ? "▼" : "▶"}
      </span>
      <h3 {...variantProps(v2, "ui2-section-title", V1_REPORTS.title)}>{title}</h3>
      {!open && summary && (
        <span {...variantProps(v2, "ui2-section-summary", V1_REPORTS.summary)}>
          {summary}
        </span>
      )}
    </>
  );
  return (
    <div {...variantProps(v2, rowClass, rowStyle)}>
      {onToggle ? (
        <div
          {...variantProps(v2, "ui2-section-clickable", V1_REPORTS.clickable)}
          onClick={onToggle}
        >
          {left}
        </div>
      ) : (
        <h3>{title}</h3>
      )}
      {action}
    </div>
  );
}

/** Collapsed/expanded section frame. */
function Section({ v2, children }: { v2: boolean; children: ReactNode }) {
  return (
    <section {...variantProps(v2, "ui2-report-section", V1_REPORTS.section)}>
      {children}
    </section>
  );
}

/** Muted informational paragraph (workbook descriptions, empty states). */
function MutedLine({ v2, children }: { v2: boolean; children: ReactNode }) {
  return <p {...variantProps(v2, "ui2-muted-line", V1_MUTED_LINE)}>{children}</p>;
}

/* ── Event Revenue ──────────────────────────────────────────────────────── */

function RevenueSection({
  v2,
  eventId,
  revenue,
  open,
  onToggle,
}: {
  v2: boolean;
  eventId: number;
  revenue: EventRevenueReport | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Section v2={v2}>
      <SectionHeader
        v2={v2}
        open={open}
        sparse={false}
        title="Event Revenue"
        onToggle={onToggle}
        summary={
          revenue && (
            <>
              Gross Revenue:{" "}
              <strong>${revenue.gross_revenue.toFixed(2)}</strong>
            </>
          )
        }
        action={
          <button
            onClick={() =>
              downloadFile(
                `/reports/${eventId}/revenue?format=csv`,
                "event-revenue.csv",
              )
            }
            {...variantProps(v2, "ui2-outline-btn", V1_REPORTS.outlineButton)}
          >
            Download CSV
          </button>
        }
      />
      {open && revenue && (
        <table {...variantProps(v2, "ui2-report-kv", V1_TABLE.kvTable)}>
          <tbody>
            {[
              ["Gross Revenue", `$${revenue.gross_revenue.toFixed(2)}`],
              ["MYSL Total", `$${revenue.mysl_total.toFixed(2)}`],
              ["Seller Total", `$${revenue.seller_total.toFixed(2)}`],
              ...(revenue.exempt_lines_total
                ? [[
                    `${revenue.exempt_seller_codes.join(", ")} (exempt, full payout)`,
                    `$${revenue.exempt_lines_total.toFixed(2)}`,
                  ] as [string, string]]
                : []),
              ["Transactions", String(revenue.total_sales)],
              ["Cash", `$${revenue.cash_total.toFixed(2)}`],
              ["Check", `$${revenue.check_total.toFixed(2)}`],
              ["Card (Square)", `$${revenue.cc_total.toFixed(2)}`],
            ].map(([label, val]) => (
              <tr key={label} {...v1Only(v2, V1_TABLE.bodyRow)}>
                <td {...v1Only(v2, V1_TABLE.kvLabel)}>{label}</td>
                <td {...v1Only(v2, V1_TABLE.cellRight)}>{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

/* ── Donations ──────────────────────────────────────────────────────────── */

function DonationsSection({
  v2,
  eventId,
  donations,
  open,
  onToggle,
}: {
  v2: boolean;
  eventId: number;
  donations: DonationsReport | null;
  open: boolean;
  onToggle: () => void;
}) {
  const summary = donations && (donations.total_items > 0 ? (
    <>
      {donations.total_items} items ·{" "}
      <strong>${donations.total_value.toFixed(2)}</strong>
    </>
  ) : (
    <>No donations</>
  ));
  return (
    <Section v2={v2}>
      <SectionHeader
        v2={v2}
        open={open}
        sparse={false}
        title="Donations"
        onToggle={onToggle}
        summary={summary}
        action={
          <button
            onClick={() =>
              downloadFile(
                `/reports/${eventId}/donations?format=csv`,
                "donations.csv",
              )
            }
            {...variantProps(v2, "ui2-outline-btn", V1_REPORTS.outlineButton)}
          >
            Download CSV
          </button>
        }
      />
      {open && donations && (
        <>
          <p>
            Total donated items: <strong>{donations.total_items}</strong>{" "}
            (value: ${donations.total_value.toFixed(2)})
          </p>
          {donations.items.length > 0 && (
            <table {...variantProps(v2, "ui2-report-table", V1_TABLE.table)}>
              <thead>
                <tr {...v1Only(v2, V1_TABLE.headRow)}>
                  <th {...v1Only(v2, V1_TABLE.thLeft)}>Seller</th>
                  <th {...v1Only(v2, V1_TABLE.thLeft)}>Item Code</th>
                  <th {...v1Only(v2, V1_TABLE.thLeft)}>Description</th>
                  <th {...v1Only(v2, V1_TABLE.thRight)}>Price</th>
                  <th {...v1Only(v2, V1_TABLE.thLeft)}>Type</th>
                </tr>
              </thead>
              <tbody>
                {donations.items.map((item) => (
                  <tr
                    key={`${item.seller_code}-${item.item_code}`}
                    {...v1Only(v2, V1_TABLE.bodyRow)}
                  >
                    <td {...v1Only(v2, V1_TABLE.cell)}>
                      <span {...variantProps(v2, "ui2-item-name", V1_REPORTS.itemName)}>
                        {item.seller_name}
                      </span>
                      <span {...variantProps(v2, "ui2-item-code", V1_REPORTS.itemCode)}>
                        ({item.seller_code})
                      </span>
                    </td>
                    <td {...v1Only(v2, V1_TABLE.cell)}>{item.item_code}</td>
                    <td {...v1Only(v2, V1_TABLE.cell)}>
                      {item.description ?? "—"}
                    </td>
                    <td {...v1Only(v2, V1_TABLE.cellRight)}>
                      ${item.price.toFixed(2)}
                    </td>
                    <td {...v1Only(v2, V1_TABLE.cell)}>
                      {item.donation_type}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Section>
  );
}

/* ── Unsold Items ───────────────────────────────────────────────────────── */

function UnsoldSection({
  v2,
  eventId,
  unsold,
  open,
  onToggle,
}: {
  v2: boolean;
  eventId: number;
  unsold: UnsoldItemsReport | null;
  open: boolean;
  onToggle: () => void;
}) {
  const summary = unsold && (unsold.total_items > 0 ? (
    <>
      {unsold.total_items} items ·{" "}
      <strong>${unsold.total_value.toFixed(2)}</strong>
    </>
  ) : (
    <>No unsold items</>
  ));
  return (
    <Section v2={v2}>
      <SectionHeader
        v2={v2}
        open={open}
        sparse={false}
        title="Unsold Items"
        onToggle={onToggle}
        summary={summary}
        action={
          <button
            onClick={() =>
              downloadFile(
                `/reports/${eventId}/unsold?format=csv`,
                "unsold-items.csv",
              )
            }
            {...variantProps(v2, "ui2-outline-btn", V1_REPORTS.outlineButton)}
          >
            Download CSV
          </button>
        }
      />
      {open && unsold && (
        <>
          {unsold.items.length === 0 && <p>No unsold items.</p>}
          {unsold.items.length > 0 && (
            <table {...variantProps(v2, "ui2-report-table", V1_TABLE.table)}>
              <thead>
                <tr {...v1Only(v2, V1_TABLE.headRow)}>
                  <th {...v1Only(v2, V1_TABLE.thLeft)}>Seller</th>
                  <th {...v1Only(v2, V1_TABLE.thLeft)}>Code</th>
                  <th {...v1Only(v2, V1_TABLE.thLeft)}>Description</th>
                  <th {...v1Only(v2, V1_TABLE.thLeft)}>Category</th>
                  <th {...v1Only(v2, V1_TABLE.thRight)}>Price</th>
                  <th {...v1Only(v2, V1_TABLE.thLeft)}>Donate</th>
                </tr>
              </thead>
              <tbody>
                {unsold.items.map((item) => (
                  <tr
                    key={`${item.seller_code}-${item.item_code}`}
                    {...v1Only(v2, V1_TABLE.bodyRow)}
                  >
                    <td {...v1Only(v2, V1_TABLE.cell)}>
                      <span {...variantProps(v2, "ui2-item-name", V1_REPORTS.itemName)}>
                        {item.seller_name}
                      </span>
                      <span {...variantProps(v2, "ui2-item-code", V1_REPORTS.itemCode)}>
                        ({item.seller_code})
                      </span>
                    </td>
                    <td {...v1Only(v2, V1_TABLE.cell)}>{item.item_code}</td>
                    <td {...v1Only(v2, V1_TABLE.cell)}>
                      {item.description ?? "—"}
                    </td>
                    <td {...v1Only(v2, V1_TABLE.cell)}>
                      {item.category ?? "—"}
                    </td>
                    <td {...v1Only(v2, V1_TABLE.cellRight)}>
                      ${item.price.toFixed(2)}
                    </td>
                    <td {...v1Only(v2, V1_TABLE.cell)}>
                      {item.donate_unsold ? "Yes" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Section>
  );
}

/* ── Transactions by user ───────────────────────────────────────────────── */

function TransactionsSection({
  v2,
  eventId,
  transactions,
  open,
  onToggle,
}: {
  v2: boolean;
  eventId: number;
  transactions: TransactionsByUserReport | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Section v2={v2}>
      <SectionHeader
        v2={v2}
        open={open}
        sparse={false}
        title="Transactions by User"
        onToggle={onToggle}
        summary={
          transactions && (
            <>
              {transactions.users.length} user
              {transactions.users.length !== 1 ? "s" : ""} ·{" "}
              {transactions.total_sales} sales ·{" "}
              <strong>${transactions.gross_sales.toFixed(2)}</strong>
            </>
          )
        }
        action={
          <button
            onClick={() =>
              downloadFile(
                `/reports/${eventId}/transactions-by-user?format=csv`,
                "transactions-by-user.csv",
              )
            }
            {...variantProps(v2, "ui2-outline-btn", V1_REPORTS.outlineButton)}
          >
            Download CSV
          </button>
        }
      />
      {open && (
        <>
          {!transactions && <p>Loading…</p>}
          {transactions && transactions.users.length === 0 && (
            <p>No transactions recorded yet.</p>
          )}
          {transactions &&
            transactions.users.map((u) => (
              <div
                key={u.cashier}
                {...variantProps(v2, "ui2-cashier-block", V1_REPORTS.cashierBlock)}
              >
                <h4 {...variantProps(v2, "ui2-cashier-heading", V1_REPORTS.cashierHeading)}>
                  <span {...variantProps(v2, "ui2-cashier-name", V1_REPORTS.cashier)}>
                    {u.cashier}
                  </span>
                  <span {...variantProps(v2, "ui2-cashier-meta", V1_REPORTS.cashierMeta)}>
                    {u.sales_count} sales
                    {u.voided_count > 0 ? ` · ${u.voided_count} voided` : ""}{" "}
                    · Gross ${u.gross_sales.toFixed(2)}
                  </span>
                </h4>
                <table {...variantProps(v2, "ui2-report-table", V1_TABLE.tableSpaced)}>
                  <thead>
                    <tr {...v1Only(v2, V1_TABLE.headRow)}>
                      <th {...v1Only(v2, V1_TABLE.thLeft)}>Sale</th>
                      <th {...v1Only(v2, V1_TABLE.thLeft)}>Date</th>
                      <th {...v1Only(v2, V1_TABLE.thRight)}>Items</th>
                      <th {...v1Only(v2, V1_TABLE.thRight)}>Units</th>
                      <th {...v1Only(v2, V1_TABLE.thRight)}>Total</th>
                      <th {...v1Only(v2, V1_TABLE.thRight)}>Cash</th>
                      <th {...v1Only(v2, V1_TABLE.thRight)}>Check</th>
                      <th {...v1Only(v2, V1_TABLE.thRight)}>Card</th>
                      <th {...v1Only(v2, V1_TABLE.thCenter)}>Voided</th>
                    </tr>
                  </thead>
                  <tbody>
                    {u.transactions.map((t) => (
                      <tr
                        key={t.sale_id}
                        {...variantProps(
                          v2,
                          t.is_voided ? "ui2-row--voided" : "",
                          t.is_voided ? V1_TABLE.bodyRowVoided : V1_TABLE.bodyRow,
                        )}
                      >
                        <td {...v1Only(v2, V1_TABLE.cell)}>#{t.sale_id}</td>
                        <td {...v1Only(v2, V1_TABLE.cell)}>
                          {t.date_of_sale
                            ? new Date(t.date_of_sale + "Z").toLocaleString()
                            : "—"}
                        </td>
                        <td {...v1Only(v2, V1_TABLE.cellRight)}>
                          {t.items_count}
                        </td>
                        <td {...v1Only(v2, V1_TABLE.cellRight)}>
                          {t.units_sold}
                        </td>
                        <td {...v1Only(v2, V1_TABLE.cellRight)}>
                          ${t.sale_total.toFixed(2)}
                        </td>
                        <td {...v1Only(v2, V1_TABLE.cellRight)}>
                          ${t.cash_amount.toFixed(2)}
                        </td>
                        <td {...v1Only(v2, V1_TABLE.cellRight)}>
                          ${t.check_amount.toFixed(2)}
                        </td>
                        <td {...v1Only(v2, V1_TABLE.cellRight)}>
                          ${t.cc_amount.toFixed(2)}
                        </td>
                        <td {...v1Only(v2, V1_TABLE.cellCenter)}>
                          {t.is_voided ? "✓" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </>
      )}
    </Section>
  );
}

/* ── Workbook sections (Vendor / Non-Vendor) ────────────────────────────── */

function WorkbookSection({
  v2,
  eventId,
  title,
  summary,
  description,
  open,
  onToggle,
  actionLabel,
  actionAriaLabel,
  fileHref,
  fileName,
}: {
  v2: boolean;
  eventId: number;
  title: string;
  /** Collapsed-state one-liner (rendered next to the heading). */
  summary: string;
  /** Expanded-state explanation (rendered below the heading). */
  description: ReactNode;
  open: boolean;
  onToggle: () => void;
  actionLabel: string;
  actionAriaLabel: string;
  fileHref: string;
  fileName: string;
}) {
  return (
    <Section v2={v2}>
      <SectionHeader
        v2={v2}
        open={open}
        sparse
        title={title}
        onToggle={onToggle}
        summary={summary}
        action={
          <button
            aria-label={actionAriaLabel}
            onClick={() => void downloadFile(`/reports/${eventId}${fileHref}`, fileName)}
            {...variantProps(v2, "ui2-outline-btn", V1_REPORTS.outlineButton)}
          >
            {actionLabel}
          </button>
        }
      />
      {open && <MutedLine v2={v2}>{description}</MutedLine>}
    </Section>
  );
}

/* ── Check transactions ─────────────────────────────────────────────────── */

function ChecksSection({
  v2,
  eventId,
  checks,
  open,
  onToggle,
}: {
  v2: boolean;
  eventId: number;
  checks: CheckTransactionsReport | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Section v2={v2}>
      <SectionHeader
        v2={v2}
        open={open}
        sparse={false}
        title="Check Transactions"
        onToggle={onToggle}
        summary={
          checks && (
            <>
              {checks.count} transaction{checks.count !== 1 ? "s" : ""} ·{" "}
              <strong>${checks.total_check_amount.toFixed(2)}</strong>
            </>
          )
        }
        action={
          <button
            aria-label="Download check transactions csv"
            onClick={() =>
              downloadFile(
                `/reports/${eventId}/check-transactions?format=csv`,
                "check-transactions.csv",
              )
            }
            {...variantProps(v2, "ui2-outline-btn", V1_REPORTS.outlineButton)}
          >
            Download CSV
          </button>
        }
      />
      {open && (
        <>
          {!checks && <p>Loading…</p>}
          {checks && checks.transactions.length === 0 && (
            <MutedLine v2={v2}>No check transactions recorded yet.</MutedLine>
          )}
          {checks && checks.transactions.length > 0 && (
            <table {...variantProps(v2, "ui2-report-table", V1_TABLE.tableSpaced)}>
              <thead>
                <tr {...v1Only(v2, V1_TABLE.headRow)}>
                  <th {...v1Only(v2, V1_TABLE.thLeft)}>Sale</th>
                  <th {...v1Only(v2, V1_TABLE.thLeft)}>Date</th>
                  <th {...v1Only(v2, V1_TABLE.thLeft)}>Cashier</th>
                  <th {...v1Only(v2, V1_TABLE.thLeft)}>Customer</th>
                  <th {...v1Only(v2, V1_TABLE.thLeft)}>Check #</th>
                  <th {...v1Only(v2, V1_TABLE.thRight)}>Check Amount</th>
                  <th {...v1Only(v2, V1_TABLE.thRight)}>Sale Total</th>
                </tr>
              </thead>
              <tbody>
                {checks.transactions.map((t) => (
                  <tr key={t.sale_id} {...v1Only(v2, V1_TABLE.bodyRow)}>
                    <td {...v1Only(v2, V1_TABLE.cell)}>#{t.sale_id}</td>
                    <td {...v1Only(v2, V1_TABLE.cell)}>
                      {t.date_of_sale
                        ? new Date(t.date_of_sale).toLocaleString()
                        : "—"}
                    </td>
                    <td {...v1Only(v2, V1_TABLE.cell)}>{t.cashier}</td>
                    <td {...v1Only(v2, V1_TABLE.cell)}>
                      {t.customer_name ?? "—"}
                    </td>
                    <td {...v1Only(v2, V1_TABLE.cell)}>
                      {t.check_number ?? "—"}
                    </td>
                    <td {...v1Only(v2, V1_TABLE.cellRight)}>
                      ${t.check_amount.toFixed(2)}
                    </td>
                    <td {...v1Only(v2, V1_TABLE.cellRight)}>
                      ${t.sale_total.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr {...v1Only(v2, V1_TABLE.totalsRow)}>
                  <td {...v1Only(v2, V1_TABLE.cell)} colSpan={5}>
                    Total ({checks.count} transaction
                    {checks.count !== 1 ? "s" : ""})
                  </td>
                  <td {...v1Only(v2, V1_TABLE.cellRight)}>
                    ${checks.total_check_amount.toFixed(2)}
                  </td>
                  <td {...v1Only(v2, V1_TABLE.cellRight)}>
                    ${checks.total_sale_amount.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </>
      )}
    </Section>
  );
}

/* ── Due Seller ─────────────────────────────────────────────────────────── */

function DueSellerSection({
  v2,
  eventId,
  selectedSeller,
  onSelectSeller,
  payoutSeller,
  onLookup,
  generateAll,
  onToggleGenerateAll,
}: {
  v2: boolean;
  eventId: number;
  selectedSeller: Seller | null;
  onSelectSeller: (s: Seller | null) => void;
  payoutSeller: Seller | null;
  onLookup: (e: FormEvent) => void;
  generateAll: boolean;
  onToggleGenerateAll: () => void;
}) {
  return (
    <Section v2={v2}>
      <div {...variantProps(v2, "ui2-section-row", V1_REPORTS.staticRow)}>
        <h3>Due Seller</h3>
        <div {...variantProps(v2, "ui2-report-actions", V1_REPORTS.actionRow)}>
          <button
            aria-label="Generate all due sellers payouts"
            onClick={onToggleGenerateAll}
            {...variantProps(v2, "ui2-outline-btn", V1_REPORTS.outlineButton)}
          >
            {generateAll ? "Hide" : "Generate All Due Sellers"}
          </button>
          {payoutSeller && (
            <>
              <button
                aria-label={`Download xlsx statement for ${payoutSeller.code}`}
                onClick={() =>
                  void downloadFile(
                    `/reports/${eventId}/seller/${payoutSeller.id}?format=xlsx`,
                    `${payoutSeller.code}_payout.xlsx`,
                  )
                }
              >
                Download XLSX
              </button>
              <button
                aria-label={`Download pdf statement for ${payoutSeller.code}`}
                onClick={() =>
                  void downloadFile(
                    `/reports/${eventId}/seller/${payoutSeller.id}?format=pdf`,
                    `${payoutSeller.code}_payout.pdf`,
                  )
                }
              >
                Download PDF
              </button>
            </>
          )}
        </div>
      </div>
      <form
        onSubmit={onLookup}
        {...variantProps(v2, "ui2-lookup-form", V1_REPORTS.lookupForm)}
      >
        <div {...variantProps(v2, "ui2-lookup-field", V1_REPORTS.lookupField)}>
          <label {...variantProps(v2, "ui2-lookup-label", V1_REPORTS.lookupLabel)}>
            Seller
          </label>
          <SellerCombobox
            onSelect={onSelectSeller}
            placeholder="Search by name or code..."
          />
        </div>
        <button type="submit" disabled={!selectedSeller}>
          Get Payout
        </button>
      </form>
      {payoutSeller && (
        <div {...variantProps(v2, "ui2-seller-block", V1_REPORTS.sellerBlock)}>
          <p>
            <strong>{sellerDisplayName(payoutSeller)}</strong> (
            {payoutSeller.code})
          </p>
          {/* key resets the panel per seller so the loading state shows on refetch. */}
          <SellerPayoutPanel
            key={payoutSeller.id}
            eventId={eventId}
            sellerId={payoutSeller.id}
          />
        </div>
      )}
      {generateAll && (
        <div {...variantProps(v2, "ui2-generate-panel", V1_REPORTS.generateAllPanel)}>
          <div {...variantProps(v2, "ui2-generate-head", V1_REPORTS.generateAllHead)}>
            <h4 {...variantProps(v2, "ui2-generate-title", V1_REPORTS.generateAllTitle)}>
              All Due Sellers
            </h4>
            <button
              aria-label="Download all due sellers payouts csv"
              onClick={() =>
                downloadFile(
                  `/reports/${eventId}/sellers-payouts?format=csv`,
                  "sellers-payouts.csv",
                )
              }
              {...variantProps(v2, "ui2-outline-btn", V1_REPORTS.outlineButton)}
            >
              Download CSV (all)
            </button>
          </div>
          <AllSellersPayouts eventId={eventId} />
        </div>
      )}
    </Section>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export function ReportsPage({ eventId }: { eventId: number }) {
  const [revenue, setRevenue] = useState<EventRevenueReport | null>(null);
  const [donations, setDonations] = useState<DonationsReport | null>(null);
  const [unsold, setUnsold] = useState<UnsoldItemsReport | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  // The seller whose payout is currently shown. Set on "Get Payout" submit;
  // the actual report is fetched and rendered by <SellerPayoutPanel>.
  const [payoutSeller, setPayoutSeller] = useState<Seller | null>(null);
  // Whether the Generate All Due Sellers batch view is expanded.
  const [generateAll, setGenerateAll] = useState(false);
  // Vendor Sales workbook section (collapsed like the other report sections).
  const [openVendorSales, setOpenVendorSales] = useState(false);
  const [openNonVendorSales, setOpenNonVendorSales] = useState(false);
  const [openChecks, setOpenChecks] = useState(false);
  const [transactions, setTransactions] =
    useState<TransactionsByUserReport | null>(null);
  const [checks, setChecks] = useState<CheckTransactionsReport | null>(null);
  const [open, setOpen] = useState({
    revenue: false,
    donations: false,
    unsold: false,
  });
  const [openTransactions, setOpenTransactions] = useState(false);
  const v2 = useUiVariant() === "v2";

  useEffect(() => {
    Promise.all([
      getEventRevenue(eventId).then(setRevenue),
      getDonations(eventId).then(setDonations),
      getUnsoldItems(eventId).then(setUnsold),
      getTransactionsByUser(eventId).then(setTransactions),
      getCheckTransactions(eventId).then(setChecks),
    ]).catch(() => {});
  }, [eventId]);

  function toggle(key: "revenue" | "donations" | "unsold" | "users") {
    if (key === "users") {
      setOpenTransactions((prev) => !prev);
      return;
    }
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handlePayoutLookup(e: FormEvent) {
    e.preventDefault();
    if (!selectedSeller) return;
    setPayoutSeller(selectedSeller);
  }

  return (
    <div>
      <RevenueSection
        v2={v2}
        eventId={eventId}
        revenue={revenue}
        open={open.revenue}
        onToggle={() => toggle("revenue")}
      />
      <DonationsSection
        v2={v2}
        eventId={eventId}
        donations={donations}
        open={open.donations}
        onToggle={() => toggle("donations")}
      />
      <UnsoldSection
        v2={v2}
        eventId={eventId}
        unsold={unsold}
        open={open.unsold}
        onToggle={() => toggle("unsold")}
      />
      <TransactionsSection
        v2={v2}
        eventId={eventId}
        transactions={transactions}
        open={openTransactions}
        onToggle={() => toggle("users")}
      />
      <WorkbookSection
        v2={v2}
        eventId={eventId}
        title="Vendor Sales"
        summary="Per-vendor sales in the league's Retailer_Sales layout"
        description="Consolidated per-vendor workbook (Seller Code + item rows + Totals row per vendor; exempt league sellers last)."
        open={openVendorSales}
        onToggle={() => setOpenVendorSales((prev) => !prev)}
        actionLabel="Download XLSX"
        actionAriaLabel="Download vendor sales workbook xlsx"
        fileHref="/vendor-sales.xlsx"
        fileName="Retailer_Sales.xlsx"
      />
      <ChecksSection
        v2={v2}
        eventId={eventId}
        checks={checks}
        open={openChecks}
        onToggle={() => setOpenChecks((prev) => !prev)}
      />
      <WorkbookSection
        v2={v2}
        eventId={eventId}
        title="Non-Vendor Sales"
        summary="Per-seller sales in the same Retailer_Sales-style layout"
        description="Consolidated per-seller workbook for non-vendor (individual) consignors — same 16-column layout as Vendor Sales; Due Seller uses the event's individual commission rate; exempt league sellers last."
        open={openNonVendorSales}
        onToggle={() => setOpenNonVendorSales((prev) => !prev)}
        actionLabel="Download XLSX"
        actionAriaLabel="Download non-vendor sales workbook xlsx"
        fileHref="/nonvendor-sales.xlsx"
        fileName="NonVendor_Sales.xlsx"
      />
      <DueSellerSection
        v2={v2}
        eventId={eventId}
        selectedSeller={selectedSeller}
        onSelectSeller={setSelectedSeller}
        payoutSeller={payoutSeller}
        onLookup={handlePayoutLookup}
        generateAll={generateAll}
        onToggleGenerateAll={() => setGenerateAll((prev) => !prev)}
      />
    </div>
  );
}
