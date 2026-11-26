/**
 * Admin Transactions — list every sale of the active event (newest first,
 * paginated, filterable per cashier, voided sales toggleable) and open the
 * shared TransactionEditor for any of them; the admin Void action lives in
 * the same panel as Edit so correcting a mistake never needs the API.
 *
 * @module TransactionsPage
 */
import { useCallback, useEffect, useState } from "react";
import { listSales, voidSale } from "../api/sales";
import { useUiVariant } from "../lib/uiVariant";
import { TRANSACTIONS, variantProps } from "./adminStyles";
import type { SaleWithItemsResponse } from "../types";
import { TransactionEditor } from "../pos/TransactionEditor";

const PAGE_SIZE = 25;

/**
 * Admin transactions list + editor panel. All roles here are admin (the page
 * renders inside AdminPage, which is admin-only); non-admin callers get a 403
 * from the server surfaced inline.
 */
export function TransactionsPage() {
  const [sales, setSales] = useState<SaleWithItemsResponse[]>([]);
  const [offset, setOffset] = useState(0);
  const [totalKnown, setTotalKnown] = useState(false);
  const [createdBy, setCreatedBy] = useState("");
  const [includeVoided, setIncludeVoided] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null);
  const v2 = useUiVariant() === "v2";

  const load = useCallback(
    (opts?: { offset?: number }) => {
      setLoading(true);
      setError(null);
      listSales({
        limit: PAGE_SIZE,
        offset: opts?.offset ?? 0,
        created_by: createdBy || undefined,
        include_voided: includeVoided || undefined,
      })
        .then((rows) => {
          setSales(rows);
          setTotalKnown(true);
          setOffset(opts?.offset ?? 0);
        })
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Failed to load transactions"),
        )
        .finally(() => setLoading(false));
    },
    [createdBy, includeVoided],
  );

  useEffect(() => {
    // Deferred one tick so spinner setState never fires synchronously inside
    // the effect (react-hooks cascading-render rule); loading starts true.
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  /** Replaces the edited/voided row in place so list totals stay live. */
  function replaceSale(updated: SaleWithItemsResponse) {
    setSales((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  async function handleVoid(s: SaleWithItemsResponse) {
    if (
      !window.confirm(
        `Void sale #${s.id} ($${s.sale_total.toFixed(2)})? ALL its items return to stock.`,
      )
    )
      return;
    setError(null);
    try {
      replaceSale(await voidSale(s.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to void sale");
    }
  }

  if (editingSaleId !== null) {
    return (
      <div>
        <h2>Transactions</h2>
        <TransactionEditor
          saleId={editingSaleId}
          onClose={() => {
            setEditingSaleId(null);
            load({ offset });
          }}
          onSaved={replaceSale}
        />
      </div>
    );
  }

  return (
    <div {...variantProps(v2, "ui2-txn", TRANSACTIONS.root)}>
      <h2>Transactions</h2>
      <div {...variantProps(v2, "ui2-txn-filters", TRANSACTIONS.filterBar)}>
        <label {...variantProps(v2, "ui2-txn-filter-label", TRANSACTIONS.filterLabel)}>
          Cashier
          <input
            value={createdBy}
            aria-label="filter by cashier"
            placeholder="e.g. cashier1"
            onChange={(e) => setCreatedBy(e.target.value)}
            {...variantProps(v2, "ui2-txn-filter-input", TRANSACTIONS.filterInput)}
          />
        </label>
        <label {...variantProps(v2, "ui2-txn-check", TRANSACTIONS.checkLabel)}>
          <input
            type="checkbox"
            checked={includeVoided}
            aria-label="include voided"
            onChange={(e) => setIncludeVoided(e.target.checked)}
          />
          Include voided
        </label>
        <button onClick={() => load()}>Apply filters</button>
      </div>

      {loading && (
        <p {...variantProps(v2, "ui2-sd-hint", TRANSACTIONS.loading)}>Loading…</p>
      )}
      {error && (
        <div role="alert" {...variantProps(v2, "ui2-txn-error", TRANSACTIONS.error)}>
          {error}
        </div>
      )}
      {!loading && !error && sales.length === 0 && (
        <p {...variantProps(v2, "ui2-txn-empty", TRANSACTIONS.empty)}>
          No transactions found.
        </p>
      )}
      {!loading && sales.length > 0 && (
        <table {...variantProps(v2, "ui2-txn-table", TRANSACTIONS.table)}>
          <thead>
            <tr>
              <th>Sale</th>
              <th>Date</th>
              <th>Cashier</th>
              <th className="ui2-num">Items</th>
              <th className="ui2-num">Total</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr
                key={s.id}
                {...variantProps(
                  v2,
                  s.is_voided ? "ui2-row--voided" : "",
                  TRANSACTIONS.row(s.is_voided),
                )}
              >
                <td {...variantProps(v2, "ui2-txn-id", TRANSACTIONS.idCell)}>#{s.id}</td>
                <td>
                  {s.date_of_sale ? new Date(s.date_of_sale).toLocaleString() : "—"}
                </td>
                <td>{s.created_by ?? "—"}</td>
                <td className="ui2-num">{s.sale_items.length}</td>
                <td className="ui2-num">${s.sale_total.toFixed(2)}</td>
                <td
                  {...variantProps(
                    v2,
                    s.is_voided ? "ui2-txn-status--void" : "ui2-txn-status--ok",
                    TRANSACTIONS.statusCell(s.is_voided),
                  )}
                >
                  {s.is_voided ? "VOIDED" : "OK"}
                </td>
                <td>
                  <button
                    onClick={() => setEditingSaleId(s.id)}
                    aria-label={`edit sale ${s.id}`}
                  >
                    Edit
                  </button>{" "}
                  {!s.is_voided && (
                    <button
                      onClick={() => void handleVoid(s)}
                      aria-label={`void sale ${s.id}`}
                    >
                      Void
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div {...variantProps(v2, "ui2-txn-pager", TRANSACTIONS.pager)}>
        <button
          onClick={() => load({ offset: Math.max(0, offset - PAGE_SIZE) })}
          disabled={totalKnown && offset === 0}
        >
          ← Previous
        </button>
        <button
          onClick={() => load({ offset: offset + PAGE_SIZE })}
          disabled={sales.length < PAGE_SIZE}
        >
          Next →
        </button>
      </div>
    </div>
  );
}