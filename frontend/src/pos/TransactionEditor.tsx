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
import { EDITOR, v1Only, v2Only, variantProps } from "./posStyles";
import { useUiVariant } from "../lib/uiVariant";
import { ApiError } from "../api/client";
import { BUTTON_STYLE } from "../lib/buttons";
import type {
  SaleEditResponse,
  SaleItemResponse,
  SaleWithItemsResponse,
} from "../types";

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
  const v2 = useUiVariant() === "v2";

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

  if (loading) {
    return <p {...variantProps(v2, "ui2-editor-loading", EDITOR.loading)}>Loading transaction…</p>;
  }
  if (!sale) {
    return (
      <p role="alert" {...variantProps(v2, "ui2-editor-load-error", EDITOR.loadError)}>
        Transaction could not be loaded.
      </p>
    );
  }

  const pendingLineTotal = lines.reduce((sum, l) => sum + l.sell_price * l.quantity, 0);
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);
  const dirtyCount = lines.filter(isDirty).length;
  const editedCardAmt = parseFloat(cc) || 0;

  return (
    <div {...variantProps(v2, "ui2-editor", EDITOR.root)}>
      <div {...variantProps(v2, "ui2-editor-header", EDITOR.headerRow)}>
        <h3 {...variantProps(v2, "ui2-editor-title", EDITOR.title)}>Edit sale #{sale.id}</h3>
        <button
          onClick={onClose}
          {...variantProps(v2, "ui2-btn ui2-btn--secondary", BUTTON_STYLE)}
          aria-label="close editor"
        >
          Close
        </button>
      </div>
      <div {...variantProps(v2, "ui2-editor-meta", EDITOR.meta)}>
        Recorded by {sale.created_by ?? "—"} · recorded total ${sale.sale_total.toFixed(2)} ·
        MYSL ${sale.mysl_total.toFixed(2)} / seller ${sale.seller_total.toFixed(2)}
        {sale.cc_fee > 0 && ` · card fee (3%) $${sale.cc_fee.toFixed(2)} (historical)`}
        {sale.is_voided ? " · VOIDED" : ""}
      </div>

      {error && (
        <div role="alert" {...variantProps(v2, "ui2-editor-error", EDITOR.error)}>
          {error}
        </div>
      )}
      {notice && !error && (
        <div role="status" {...variantProps(v2, "ui2-editor-notice", EDITOR.notice)}>
          {notice}
        </div>
      )}

      <div {...v2Only(v2, "ui2-scroll-x")}>
      <table {...variantProps(v2, "ui2-editor-table", EDITOR.table)}>
        <thead>
          <tr {...v1Only(v2, EDITOR.theadRow)}>
            <th {...v1Only(v2, EDITOR.thLeft)}>Code</th>
            <th {...variantProps(v2, "ui2-num", EDITOR.thRight)}>Qty</th>
            <th {...variantProps(v2, "ui2-num", EDITOR.thRight)}>Unit Price</th>
            <th {...variantProps(v2, "ui2-num", EDITOR.thRight)}>Line Total</th>
            <th {...v1Only(v2, EDITOR.thLeft)}>Notes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr
              key={l.id}
              {...variantProps(
                v2,
                isDirty(l) ? "ui2-editor-row--dirty" : "",
                EDITOR.bodyRow(isDirty(l)),
              )}
            >
              <td {...v1Only(v2, EDITOR.td)}>{l.item_code ?? "—"}</td>
              <td {...variantProps(v2, "ui2-num", EDITOR.tdRight)}>
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
                  {...variantProps(v2, "ui2-editor-qty", EDITOR.qtyInput)}
                />
              </td>
              <td {...variantProps(v2, "ui2-num", EDITOR.tdRight)}>
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
                  {...variantProps(v2, "ui2-editor-price", EDITOR.priceInput)}
                />
              </td>
              <td {...variantProps(v2, "ui2-num", EDITOR.tdRight)}>
                ${(l.sell_price * l.quantity).toFixed(2)}
              </td>
              <td {...v1Only(v2, EDITOR.td)}>
                <input
                  value={l.notes ?? ""}
                  aria-label={`notes for ${l.item_code ?? l.id}`}
                  onChange={(e) => updateDraft(l.id, { notes: e.target.value })}
                  {...variantProps(v2, "ui2-editor-notes", EDITOR.notesInput)}
                />
              </td>
              <td {...v1Only(v2, EDITOR.td)}>
                <button
                  onClick={() => void handleRemove(l)}
                  aria-label={`remove ${l.item_code ?? l.id}`}
                  disabled={saving}
                  {...variantProps(v2, "ui2-editor-remove", EDITOR.removeBtn)}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div {...variantProps(v2, "ui2-editor-actions", EDITOR.lineActions)}>
        <button
          {...v2Only(v2, "ui2-btn ui2-btn--primary")}
          onClick={() => void handleSaveLines()}
          disabled={saving}
        >
          Save line changes{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
        </button>
        <span {...variantProps(v2, "ui2-editor-pending", EDITOR.pendingTotal)}>
          {itemCount} {itemCount === 1 ? "item" : "items"} · Pending total:{" "}
          <span>${(pendingLineTotal + (sale.cc_fee ?? 0)).toFixed(2)}</span>
        </span>
        {sale.cc_fee > 0 && (
          <span {...variantProps(v2, "ui2-editor-small-note", EDITOR.smallNote)}>
            (includes card fee (3%) ${sale.cc_fee.toFixed(2)})
          </span>
        )}
      </div>

      <div {...variantProps(v2, "ui2-editor-add", EDITOR.addItem)}>
        <div {...variantProps(v2, "ui2-editor-add-label", EDITOR.addItemLabel)}>Add item:</div>
        <LookupField onFound={(item) => void handleAdd(item)} />
      </div>

      <fieldset {...variantProps(v2, "ui2-editor-fieldset", EDITOR.fieldset)}>
        <legend {...variantProps(v2, "ui2-editor-legend", EDITOR.legend)}>Payment & details</legend>
        <div {...variantProps(v2, "ui2-editor-field-row", EDITOR.fieldRow)}>
          <label {...variantProps(v2, "ui2-editor-field-label", EDITOR.fieldLabel)}>
            Cash ($)
            <input type="number" min={0} step={0.01} value={cash} aria-label="edit cash amount"
              onChange={(e) => setCash(e.target.value)} {...variantProps(v2, "ui2-editor-field-input", EDITOR.fieldInput(110))} />
          </label>
          <label {...variantProps(v2, "ui2-editor-field-label", EDITOR.fieldLabel)}>
            Check ($)
            <input type="number" min={0} step={0.01} value={check} aria-label="edit check amount"
              onChange={(e) => setCheck(e.target.value)} {...variantProps(v2, "ui2-editor-field-input", EDITOR.fieldInput(110))} />
          </label>
          <label {...variantProps(v2, "ui2-editor-field-label", EDITOR.fieldLabel)}>
            Card ($)
            <input type="number" min={0} step={0.01} value={cc} aria-label="edit card amount"
              onChange={(e) => setCc(e.target.value)} {...variantProps(v2, "ui2-editor-field-input", EDITOR.fieldInput(110))} />
          </label>
          <label {...variantProps(v2, "ui2-editor-field-label", EDITOR.fieldLabel)}>
            Check number
            <input value={checkNumber} aria-label="edit check number"
              onChange={(e) => setCheckNumber(e.target.value)} {...variantProps(v2, "ui2-editor-field-input", EDITOR.fieldInput(140))} />
          </label>
          <label {...variantProps(v2, "ui2-editor-field-label", EDITOR.fieldLabel)}>
            Card reference
            <input value={ccTransactionId} aria-label="edit card reference"
              onChange={(e) => setCcTransactionId(e.target.value)} {...variantProps(v2, "ui2-editor-field-input", EDITOR.fieldInput(160))} />
          </label>
        </div>
        <div {...variantProps(v2, "ui2-editor-field-row", EDITOR.fieldRow)}>
          <label {...variantProps(v2, "ui2-editor-field-label", EDITOR.fieldLabel)}>
            Customer name
            <input value={customerName} aria-label="edit customer name"
              onChange={(e) => setCustomerName(e.target.value)} {...variantProps(v2, "ui2-editor-field-input", EDITOR.fieldInput(180))} />
          </label>
          <label {...variantProps(v2, "ui2-editor-field-label", EDITOR.fieldLabel)}>
            Customer email
            <input value={customerEmail} aria-label="edit customer email"
              onChange={(e) => setCustomerEmail(e.target.value)} {...variantProps(v2, "ui2-editor-field-input", EDITOR.fieldInput(180))} />
          </label>
          <label {...variantProps(v2, "ui2-editor-field-label", EDITOR.fieldLabel)}>
            Sale notes
            <input value={saleNotes} aria-label="edit sale notes"
              onChange={(e) => setSaleNotes(e.target.value)} {...variantProps(v2, "ui2-editor-field-input", EDITOR.fieldInput(220))} />
          </label>
        </div>
        {editedCardAmt > 0 && (
          <div {...variantProps(v2, "ui2-editor-card-fee-note", EDITOR.cardFeeNote)}>
            Card charge ${editedCardAmt.toFixed(2)} is charged to the buyer as
            entered (card fee removed 2026-11-24). New sales no longer derive
            a 3% fee; historical sales keep their recorded fee.
          </div>
        )}
        <button
          {...v2Only(v2, "ui2-btn ui2-btn--primary")}
          onClick={() => void handleSavePayments()}
          disabled={saving}
        >
          Save payment & details
        </button>
      </fieldset>

      <div>
        <div {...variantProps(v2, "ui2-editor-history-label", EDITOR.historyLabel)}>Edit history (newest first)</div>
        {history.length === 0 ? (
          <p {...variantProps(v2, "ui2-editor-history-empty", EDITOR.historyEmpty)}>No edits recorded.</p>
        ) : (
          <ul {...variantProps(v2, "ui2-editor-history", EDITOR.historyList)}>
            {history.map((e) => (
              <li key={e.id}>
                <strong>{e.action}</strong> by {e.edited_by} at{" "}
                {new Date(e.edited_at + (e.edited_at.endsWith("Z") ? "" : "Z")).toLocaleString()}
                {e.action === "update_line" && e.before && e.after ? (
                  <span {...variantProps(v2, "ui2-editor-history-detail", EDITOR.historyDetail)}>
                    {" "}
                    — {String(e.before["item_code"] ?? "")}{" "}
                    ${String(e.before["sell_price"] ?? "?")} ×{" "}
                    {String(e.before["quantity"] ?? "?")} → $
                    {String(e.after["sell_price"] ?? "?")} × {String(e.after["quantity"] ?? "?")}
                  </span>
                ) : e.action === "add_line" && e.after ? (
                  <span {...variantProps(v2, "ui2-editor-history-detail", EDITOR.historyDetail)}>
                    {" "}
                    — {String(e.after["item_code"] ?? "")} ({"$"}
                    {String(e.after["sell_price"] ?? "?")} × {String(e.after["quantity"] ?? "?")})
                  </span>
                ) : e.action === "remove_line" && e.before ? (
                  <span {...variantProps(v2, "ui2-editor-history-detail", EDITOR.historyDetail)}>
                    {" "}
                    — {String(e.before["item_code"] ?? "")} removed
                  </span>
                ) : e.action === "update_payments" || e.action === "update_info" ? (
                  <span {...variantProps(v2, "ui2-editor-history-detail", EDITOR.historyDetail)}> — fields corrected</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}