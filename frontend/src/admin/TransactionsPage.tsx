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
import { BUTTON_STYLE } from "../lib/buttons";
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
    <div style={{ maxWidth: 900 }}>
      <h2>Transactions</h2>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <label style={{ fontSize: 13 }}>
          Cashier
          <input
            value={createdBy}
            aria-label="filter by cashier"
            placeholder="e.g. cashier1"
            onChange={(e) => setCreatedBy(e.target.value)}
            style={{ display: "block", width: 160, padding: "4px 6px" }}
          />
        </label>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={includeVoided}
            aria-label="include voided"
            onChange={(e) => setIncludeVoided(e.target.checked)}
          />
          Include voided
        </label>
        <button onClick={() => load()} style={BUTTON_STYLE}>
          Apply filters
        </button>
      </div>

      {loading && <p style={{ color: "#64748b" }}>Loading…</p>}
      {error && (
        <div role="alert" style={{ color: "red", marginBottom: 10 }}>
          {error}
        </div>
      )}
      {!loading && !error && sales.length === 0 && (
        <p style={{ color: "#888", fontStyle: "italic" }}>No transactions found.</p>
      )}
      {!loading && sales.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #ccc", fontSize: 13, color: "#555" }}>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Sale</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Date</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Cashier</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Items</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Total</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr
                key={s.id}
                style={{
                  borderBottom: "1px solid #eee",
                  color: s.is_voided ? "#9ca3af" : undefined,
                }}
              >
                <td style={{ padding: "6px 8px", fontWeight: 600 }}>#{s.id}</td>
                <td style={{ padding: "6px 8px" }}>
                  {s.date_of_sale ? new Date(s.date_of_sale).toLocaleString() : "—"}
                </td>
                <td style={{ padding: "6px 8px" }}>{s.created_by ?? "—"}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{s.sale_items.length}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>
                  ${s.sale_total.toFixed(2)}
                </td>
                <td style={{ padding: "6px 8px", color: s.is_voided ? "#b91c1c" : "#15803d" }}>
                  {s.is_voided ? "VOIDED" : "OK"}
                </td>
                <td style={{ padding: "6px 8px" }}>
                  <button
                    onClick={() => setEditingSaleId(s.id)}
                    aria-label={`edit sale ${s.id}`}
                    style={{ ...BUTTON_STYLE, padding: "4px 12px", fontSize: 13 }}
                  >
                    Edit
                  </button>{" "}
                  {!s.is_voided && (
                    <button
                      onClick={() => void handleVoid(s)}
                      aria-label={`void sale ${s.id}`}
                      style={{ ...BUTTON_STYLE, padding: "4px 12px", fontSize: 13 }}
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
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          onClick={() => load({ offset: Math.max(0, offset - PAGE_SIZE) })}
          disabled={totalKnown && offset === 0}
          style={BUTTON_STYLE}
        >
          ← Previous
        </button>
        <button
          onClick={() => load({ offset: offset + PAGE_SIZE })}
          disabled={sales.length < PAGE_SIZE}
          style={BUTTON_STYLE}
        >
          Next →
        </button>
      </div>
    </div>
  );
}