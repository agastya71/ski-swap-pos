/**
 * Transaction editor — true editing of a completed (non-voided) sale.
 * Cashiers get this for their OWN sales; admins for any sale (server-enforced:
 * 403 "You can only edit your own transactions" surfaces inline otherwise).
 *
 * Editing model (docs/superpowers/specs/2026-10-25-transaction-editing-design.md):
 *  - add a line via the item-code lookup (posts, stock-checked like checkout);
 *  - change quantity / per-line price / notes locally, then "Save line changes"
 *    PATCHes each dirty line (stock invariants enforced server-side; 422 text
 *    surfaces inline);
 *  - "Remove" a line (units re-stocked; confirm; a sale always keeps ≥ 1 line);
 *  - fix payment tender + customer info ("Save payment & details" — single PATCH,
 *    total_paid/balance_due recomputed server-side, negative balance = change due);
 *  - every action appends an audit row, shown in the history panel (newest first).
 *
 * @module TransactionEditor
 */
import { useEffect, useState } from "react";
import {
  addSaleLine,
  editSale,
  editSaleLine,
  fetchSaleEdits,
  getSale,
  removeSaleLine,
} from "../api/sales";
import { LookupField } from "./LookupField";
import { ApiError } from "../api/client";
import { BUTTON_STYLE } from "../lib/buttons";
import type {
  SaleEditResponse,
  SaleItemResponse,
  SaleWithItemsResponse,
} from "../types";

const NAVY = "#1e3a8a";

/** Client-side mirror of the D8 rule: never submit a remove that empties the sale. */
const LAST_LINE_MESSAGE = "Sale keeps at least one line — void it instead";

/** A locally-drafted (not yet saved) line: original + current field values. */
interface DraftLine {
  id: number;
  item_code: string | null;
  quantity: number;
  sell_price: number;
  notes: string | null;
  original: { quantity: number; sell_price: number; notes: string | null };
}

function toDraft(si: SaleItemResponse): DraftLine {
  return {
    id: si.id,
    item_code: si.item_code,
    quantity: si.quantity,
    sell_price: si.sell_price,
    notes: si.notes,
    original: { quantity: si.quantity, sell_price: si.sell_price, notes: si.notes },
  };
}

/** Renders the full editor for one sale; the parent supplies closing/refresh hooks. */
export function TransactionEditor({
  saleId,
  onSaved,
  onClose,
}: {
  saleId: number;
  /** Fired after every accepted server change (with the fresh sale) — lets the
   *  parent refresh its list so totals stay live. */
  onSaved?: (sale: SaleWithItemsResponse) => void;
  onClose: () => void;
}) {
  const [sale, setSale] = useState<SaleWithItemsResponse | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [history, setHistory] = useState<SaleEditResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Payment/details drafts (initialized from the sale on load).
  const [cash, setCash] = useState("0");
  const [check, setCheck] = useState("0");
  const [checkNumber, setCheckNumber] = useState("");
  const [cc, setCc] = useState("0");
  const [ccTransactionId, setCcTransactionId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [saleNotes, setSaleNotes] = useState("");
  const [paymentOriginals, setPaymentOriginals] = useState<Record<string, unknown>>({});

  function applySale(s: SaleWithItemsResponse) {
    setSale(s);
    setLines(s.sale_items.map(toDraft));
    setCash(String(s.cash_amount ?? 0));
    setCheck(String(s.check_amount ?? 0));
    setCheckNumber(s.check_number ?? "");
    setCc(String(s.cc_amount ?? 0));
    setCcTransactionId(s.cc_transaction_id ?? "");
    setCustomerName(s.customer_name ?? "");
    setCustomerEmail(s.customer_email ?? "");
    setSaleNotes(s.notes ?? "");
    setPaymentOriginals({
      cash_amount: s.cash_amount ?? 0,
      check_amount: s.check_amount ?? 0,
      check_number: s.check_number ?? null,
      cc_amount: s.cc_amount ?? 0,
      cc_transaction_id: s.cc_transaction_id ?? null,
      customer_name: s.customer_name ?? null,
      customer_email: s.customer_email ?? null,
      notes: s.notes ?? null,
    });
  }

  async function refreshHistory() {
    try {
      setHistory(await fetchSaleEdits(saleId));
    } catch {
      /* history is non-critical */
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getSale(saleId), fetchSaleEdits(saleId)])
      .then(([s, edits]) => {
        if (!active) return;
        applySale(s);
        setHistory(edits);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load transaction"),
      )
      .finally(() => setLoading(false));
    return () => {
      active = false;
    };
  }, [saleId]);

  function isDirty(l: DraftLine): boolean {
    return (
      l.quantity !== l.original.quantity ||
      l.sell_price !== l.original.sell_price ||
      (l.notes ?? null) !== l.original.notes
    );
  }

  function updateDraft(id: number, patch: Partial<Pick<DraftLine, "quantity" | "sell_price" | "notes">>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  /** PATCHes every dirty line sequentially; stops on the first server error. */
  async function handleSaveLines() {
    const dirty = lines.filter(isDirty);
    if (dirty.length === 0) {
      setNotice("No line changes to save.");
      return;
    }
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      let latest: SaleWithItemsResponse | null = null;
      for (const l of dirty) {
        latest = await editSaleLine(saleId, l.id, {
          quantity: l.quantity,
          sell_price: l.sell_price,
          notes: l.notes ?? undefined,
        });
      }
      if (latest) {
        applySale(latest);
        onSaved?.(latest);
        await refreshHistory();
        setNotice("Line changes saved.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save line changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd(item: { id: number; price: number }) {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const updated = await addSaleLine(saleId, { item_id: item.id, sell_price: item.price });
      applySale(updated);
      onSaved?.(updated);
      await refreshHistory();
      setNotice("Item added.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add item");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(line: DraftLine) {
    if (lines.length <= 1) {
      setError(LAST_LINE_MESSAGE);
      return;
    }
    if (!window.confirm(`Remove line ${line.item_code ?? ""} from sale #${saleId}? Its units return to stock.`)) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const updated = await removeSaleLine(saleId, line.id);
      applySale(updated);
      onSaved?.(updated);
      await refreshHistory();
      setNotice("Line removed — units returned to stock.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove line");
    } finally {
      setSaving(false);
    }
  }

  /** PATCHes only the payment/details fields the user actually changed.
   *  DB nulls are normalized to "" so an untouched empty field is never sent —
   *  only genuine changes reach the PATCH body. */
  async function handleSavePayments() {
    const norm = (v: unknown) => (v == null ? "" : String(v));
    const patch: Record<string, unknown> = {};
    const c = parseFloat(cash);
    const chk = parseFloat(check);
    const card = parseFloat(cc);
    if (isFinite(c) && c !== Number(paymentOriginals["cash_amount"])) patch["cash_amount"] = c;
    if (isFinite(chk) && chk !== Number(paymentOriginals["check_amount"])) patch["check_amount"] = chk;
    if (checkNumber.trim() !== norm(paymentOriginals["check_number"])) patch["check_number"] = checkNumber.trim();
    if (isFinite(card) && card !== Number(paymentOriginals["cc_amount"])) patch["cc_amount"] = card;
    if (ccTransactionId.trim() !== norm(paymentOriginals["cc_transaction_id"])) patch["cc_transaction_id"] = ccTransactionId.trim();
    if (customerName !== norm(paymentOriginals["customer_name"])) patch["customer_name"] = customerName;
    if (customerEmail !== norm(paymentOriginals["customer_email"])) patch["customer_email"] = customerEmail;
    if (saleNotes !== norm(paymentOriginals["notes"])) patch["notes"] = saleNotes;

    if (Object.keys(patch).length === 0) {
      setNotice("No payment changes to save.");
      return;
    }
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const updated = await editSale(saleId, patch);
      applySale(updated);
      onSaved?.(updated);
      await refreshHistory();
      setNotice("Payment/details saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save payments");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p style={{ color: "#64748b" }}>Loading transaction…</p>;
  if (!sale) return <p role="alert" style={{ color: "red" }}>Transaction could not be loaded.</p>;

  const pendingLineTotal = lines.reduce((sum, l) => sum + l.sell_price * l.quantity, 0);
  const dirtyCount = lines.filter(isDirty).length;
  const editedCardAmt = parseFloat(cc) || 0;
  const editedCardFee =
    editedCardAmt > 0
      ? Math.round(((editedCardAmt * 0.03) / 1.03) * 100) / 100
      : 0;

  return (
    <div style={{ border: "2px solid " + NAVY, borderRadius: 6, padding: 14, marginTop: 8, background: "#f8fafc" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ color: NAVY, margin: 0 }}>Edit sale #{sale.id}</h3>
        <button onClick={onClose} style={BUTTON_STYLE} aria-label="close editor">
          Close
        </button>
      </div>
      <div style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>
        Recorded by {sale.created_by ?? "—"} · recorded total ${sale.sale_total.toFixed(2)} ·
        MYSL ${sale.mysl_total.toFixed(2)} / seller ${sale.seller_total.toFixed(2)}
        {sale.cc_fee > 0 && ` · card fee (3%) $${sale.cc_fee.toFixed(2)}`}
        {sale.is_voided ? " · VOIDED" : ""}
      </div>

      {error && (
        <div role="alert" style={{ color: "red", marginBottom: 8 }}>
          {error}
        </div>
      )}
      {notice && !error && (
        <div role="status" style={{ color: "#166534", marginBottom: 8 }}>
          {notice}
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ccc", fontSize: 13, color: "#555" }}>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Code</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>Qty</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>Unit Price</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>Line Total</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Notes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} style={{ borderBottom: "1px solid #eee", fontWeight: isDirty(l) ? 700 : 400 }}>
              <td style={{ padding: "6px 8px" }}>{l.item_code ?? "—"}</td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={l.quantity}
                  aria-label={`quantity for ${l.item_code ?? l.id}`}
                  onChange={(e) => {
                    const q = parseInt(e.target.value, 10);
                    if (!Number.isNaN(q)) updateDraft(l.id, { quantity: q });
                  }}
                  style={{ width: 56, padding: "4px 6px", fontSize: 14, textAlign: "right" }}
                />
              </td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={l.sell_price}
                  aria-label={`unit price for ${l.item_code ?? l.id}`}
                  onChange={(e) => {
                    const p = parseFloat(e.target.value);
                    if (!Number.isNaN(p)) updateDraft(l.id, { sell_price: p });
                  }}
                  style={{ width: 80, padding: "4px 6px", fontSize: 14, textAlign: "right" }}
                />
              </td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>
                ${(l.sell_price * l.quantity).toFixed(2)}
              </td>
              <td style={{ padding: "6px 8px" }}>
                <input
                  value={l.notes ?? ""}
                  aria-label={`notes for ${l.item_code ?? l.id}`}
                  onChange={(e) => updateDraft(l.id, { notes: e.target.value })}
                  style={{ width: 200, padding: "4px 6px", fontSize: 13 }}
                />
              </td>
              <td style={{ padding: "6px 8px" }}>
                <button
                  onClick={() => void handleRemove(l)}
                  aria-label={`remove ${l.item_code ?? l.id}`}
                  disabled={saving}
                  style={{ fontSize: 12, cursor: "pointer" }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => void handleSaveLines()} disabled={saving}>
          Save line changes{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
        </button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>
          Pending total:{" "}
          <span>${(pendingLineTotal + (sale.cc_fee ?? 0)).toFixed(2)}</span>
        </span>
        {sale.cc_fee > 0 && (
          <span style={{ fontSize: 13, color: "#555" }}>
            (includes card fee (3%) ${sale.cc_fee.toFixed(2)})
          </span>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Add item:</div>
        <LookupField onFound={(item) => void handleAdd(item)} />
      </div>

      <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 4, padding: 10, marginBottom: 12 }}>
        <legend style={{ fontSize: 13, fontWeight: 600 }}>Payment & details</legend>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
          <label style={{ fontSize: 13 }}>
            Cash ($)
            <input type="number" min={0} step={0.01} value={cash} aria-label="edit cash amount"
              onChange={(e) => setCash(e.target.value)} style={{ display: "block", width: 110, padding: "4px 6px" }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Check ($)
            <input type="number" min={0} step={0.01} value={check} aria-label="edit check amount"
              onChange={(e) => setCheck(e.target.value)} style={{ display: "block", width: 110, padding: "4px 6px" }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Card ($)
            <input type="number" min={0} step={0.01} value={cc} aria-label="edit card amount"
              onChange={(e) => setCc(e.target.value)} style={{ display: "block", width: 110, padding: "4px 6px" }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Check number
            <input value={checkNumber} aria-label="edit check number"
              onChange={(e) => setCheckNumber(e.target.value)} style={{ display: "block", width: 140, padding: "4px 6px" }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Card reference
            <input value={ccTransactionId} aria-label="edit card reference"
              onChange={(e) => setCcTransactionId(e.target.value)} style={{ display: "block", width: 160, padding: "4px 6px" }} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
          <label style={{ fontSize: 13 }}>
            Customer name
            <input value={customerName} aria-label="edit customer name"
              onChange={(e) => setCustomerName(e.target.value)} style={{ display: "block", width: 180, padding: "4px 6px" }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Customer email
            <input value={customerEmail} aria-label="edit customer email"
              onChange={(e) => setCustomerEmail(e.target.value)} style={{ display: "block", width: 180, padding: "4px 6px" }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Sale notes
            <input value={saleNotes} aria-label="edit sale notes"
              onChange={(e) => setSaleNotes(e.target.value)} style={{ display: "block", width: 220, padding: "4px 6px" }} />
          </label>
        </div>
        {editedCardAmt > 0 && (
          <div style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>
            Card charge ${editedCardAmt.toFixed(2)} includes the 3% card fee:
            ${editedCardFee.toFixed(2)} (items on card $
            {(editedCardAmt - editedCardFee).toFixed(2)}). Saving re-derives the
            fee and updates the sale total.
          </div>
        )}
        <button onClick={() => void handleSavePayments()} disabled={saving}>
          Save payment & details
        </button>
      </fieldset>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Edit history (newest first)</div>
        {history.length === 0 ? (
          <p style={{ color: "#888", fontStyle: "italic", fontSize: 13 }}>No edits recorded.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
            {history.map((e) => (
              <li key={e.id}>
                <strong>{e.action}</strong> by {e.edited_by} at{" "}
                {new Date(e.edited_at + (e.edited_at.endsWith("Z") ? "" : "Z")).toLocaleString()}
                {e.action === "update_line" && e.before && e.after ? (
                  <span style={{ color: "#64748b" }}>
                    {" "}
                    — {String(e.before["item_code"] ?? "")}{" "}
                    ${String(e.before["sell_price"] ?? "?")} ×{" "}
                    {String(e.before["quantity"] ?? "?")} → $
                    {String(e.after["sell_price"] ?? "?")} × {String(e.after["quantity"] ?? "?")}
                  </span>
                ) : e.action === "add_line" && e.after ? (
                  <span style={{ color: "#64748b" }}>
                    {" "}
                    — {String(e.after["item_code"] ?? "")} ({"$"}
                    {String(e.after["sell_price"] ?? "?")} × {String(e.after["quantity"] ?? "?")})
                  </span>
                ) : e.action === "remove_line" && e.before ? (
                  <span style={{ color: "#64748b" }}>
                    {" "}
                    — {String(e.before["item_code"] ?? "")} removed
                  </span>
                ) : e.action === "update_payments" || e.action === "update_info" ? (
                  <span style={{ color: "#64748b" }}> — fields corrected</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}