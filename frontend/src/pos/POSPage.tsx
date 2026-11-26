/**
 * POS checkout page — single-page checkout: item lookup/cart building, payment
 * entry, and confirmation all on one screen. Cart lines (with per-line quantity,
 * price override, and notes) are persisted to localStorage under 'pos_cart'.
 *
 * When a sale completes, an inline confirmation banner (receipt summary + a
 * "New Transaction" button) appears on the SAME screen as the cart — the cart
 * stays visible as the line-item receipt. "New Transaction" clears state and
 * returns to editing. There is no separate confirmation screen.
 *
 * Both the cart and the completed sale are persisted to localStorage, so a
 * page reload after a completed sale restores the read-only receipt instead
 * of an editable cart of already-sold items. Cancel abandons the whole
 * checkout (with confirmation), clearing the cart back to lookup state.
 *
 * @module POSPage
 */
import { useEffect, useState } from "react";
import { BUTTON_STYLE } from "../lib/buttons";
import { createSale, fetchMySales, reserveSale, voidSale } from "../api/sales";
import { getActiveEvent } from "../api/events";
import { LookupField } from "./LookupField";
import { Cart, type CartLine } from "./Cart";
import { PaymentForm, type PaymentSubmit } from "./PaymentForm";
import { SquarePayment } from "./SquarePayment";
import type { ItemLookupResponse, SaleWithItemsResponse } from "../types";
import { TransactionEditor } from "./TransactionEditor";
import { POS_PAGE, v1Only, variantProps } from "./posStyles";
import { useUiVariant } from "../lib/uiVariant";

const CART_KEY = "pos_cart";
/** localStorage key preserving the completed sale across reloads. Without it,
 *  a completed checkout comes back after refresh as an editable cart of
 *  already-sold items; with it, the cashier sees the read-only receipt. */
const SALE_KEY = "pos_sale";

/** Square card integration is not complete — the card option (the Square SDK
 *  panel and the manual card-amount/transaction-id fields) is hidden from the
 *  checkout screen. Flip to true to restore it. */
const SQUARE_CARD_ENABLED = false;

/** Validate restored localStorage JSON shape (defense against corrupted or
 *  hand-edited storage: wrong-shape-but-parseable JSON would otherwise crash
 *  the POS render instead of degrading to an empty state). */
function loadPersistedLines(): CartLine[] {
  try {
    const stored = localStorage.getItem(CART_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? (parsed.filter(
          (l: unknown) =>
            !!l && typeof l === "object" && "item" in (l as object),
        ) as CartLine[])
      : [];
  } catch {
    return [];
  }
}

function loadPersistedSale(): SaleWithItemsResponse | null {
  try {
    const stored = localStorage.getItem(SALE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as SaleWithItemsResponse;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.id === "number" &&
      typeof parsed.sale_total === "number"
    ) {
      return parsed;
    }
    localStorage.removeItem(SALE_KEY);
    return null;
  } catch {
    return null;
  }
}

/**
 * Root POS component. Manages cart lines, the completed sale (if any), Square
 * token, and sale submission. The payment form is visible only while editing
 * (no sale in progress); once a sale completes, the inline confirmation banner
 * replaces it on the same page.
 */
export function POSPage() {
  const [lines, setLinesState] = useState<CartLine[]>(loadPersistedLines);
  const [sale, setSale] = useState<SaleWithItemsResponse | null>(
    loadPersistedSale,
  );
  const [squareToken, setSquareToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventName, setEventName] = useState<string | null>(null);
  // PaymentForm owns its field state internally (cash/check/card/check-number/
  // notes) and stays mounted across a checkout cancel — bumping this key
  // REMOUNTS it so a cancelled transaction never leaks amounts (and refs)
  // into the next customer's checkout.
  const [formResetKey, setFormResetKey] = useState(0);
  // Reserved transaction (issue #12): set the moment the cashier starts
  // building a cart, so the display ID shown at checkout equals the row the
  // buyer has been watching accumulate. Cleared on completion / cancel /
  // "New Transaction" (cancel + abandon VOID the row → its number retires).
  const [reservation, setReservation] = useState<SaleWithItemsResponse | null>(
    null,
  );
  // Focus recapture (#1 event feedback): when an item is added or removed, the
  // scan field must recapture focus so the next scanner shot can't land in a
  // cart or payment input the cashier just clicked into. Bumping this state
  // counter re-runs LookupField's focus effect; no refs/effects needed here.
  const [focusSignal, setFocusSignal] = useState(0);

  // The event name labels every checkout transaction (header + receipt banner).
  // Non-critical: if it can't be fetched, the screens render without it.
  useEffect(() => {
    getActiveEvent()
      .then((e) => setEventName(e.name))
      .catch(() => {});
  }, []);

  // My Transactions — the cashier's own sales, read-only (loaded on demand).
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySales, setHistorySales] = useState<SaleWithItemsResponse[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);
  // Open editor for one of the cashier's own (non-voided) transactions.
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null);

  /** Loads the cashier's transaction history (once per session open). */
  async function handleToggleHistory() {
    setHistoryOpen((o) => {
      const next = !o;
      if (next && !historyLoaded && !historyLoading) {
        setHistoryLoading(true);
        setHistoryError(null);
        fetchMySales()
          .then((sales) => {
            setHistorySales(sales);
            setHistoryLoaded(true);
          })
          .catch((err) =>
            setHistoryError(
              err instanceof Error
                ? err.message
                : "Failed to load transactions",
            ),
          )
          .finally(() => setHistoryLoading(false));
      }
      return next;
    });
  }

  /** Sets the completed sale and persists it so a reload restores the receipt,
   *  not an editable cart of sold items. null clears the persisted copy. */
  function persistSale(s: SaleWithItemsResponse | null) {
    try {
      if (s) localStorage.setItem(SALE_KEY, JSON.stringify(s));
      else localStorage.removeItem(SALE_KEY);
    } catch {
      /* non-browser environment */
    }
    setSale(s);
  }

  function setLines(updater: CartLine[] | ((prev: CartLine[]) => CartLine[])) {
    setLinesState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try {
        if (next.length === 0) localStorage.removeItem(CART_KEY);
        else localStorage.setItem(CART_KEY, JSON.stringify(next));
      } catch {
        /* non-browser environment */
      }
      return next;
    });
  }

  /** Appends a scanned/selected item; if already in the cart, increments quantity (capped at remaining). */
  function handleFound(item: ItemLookupResponse) {
    setLines((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) {
        const maxQty = Math.max(1, Math.floor(item.remaining));
        return prev.map((l) =>
          l.item.id === item.id
            ? { ...l, quantity: Math.min(l.quantity + 1, maxQty) }
            : l,
        );
      }
      return [
        ...prev,
        { item, quantity: 1, sell_price: item.price, notes: "" },
      ];
    });
    // Item added (#1): recapture the scan field in case the cursor drifted.
    setFocusSignal((s) => s + 1);
  }

  function handleUpdate(id: number, patch: Partial<CartLine>) {
    setLines((prev) =>
      prev.map((l) => (l.item.id === id ? { ...l, ...patch } : l)),
    );
  }

  function handleRemove(id: number) {
    setLines((prev) => prev.filter((l) => l.item.id !== id));
    setFocusSignal((s) => s + 1);
  }

  /** Issue #12 — reserves the next transaction number the moment the cart
   *  becomes non-empty, so the display ID is pinned from sale start. Failure
   *  is soft (cart keeps working; checkout without a reservation still works). */
  useEffect(() => {
    if (sale || lines.length === 0 || reservation) return;
    reserveSale()
      .then(setReservation)
      .catch(() => {});
  }, [sale, lines.length, reservation]);

  /** Submits the sale (with per-line qty/price/notes + payment breakdown) then shows the inline confirmation. */
  async function handlePayment(p: PaymentSubmit) {
    setError(null);
    try {
      const created = await createSale({
        // Adopt the reservation from sale start (issue #12): the finished row
        // keeps the id/transaction_number the cashier quoted. If reservation
        // is null (page-load race, older backend), a plain checkout still works.
        transaction_id: reservation?.id,
        items: lines.map((l) => ({
          item_id: l.item.id,
          quantity: l.quantity,
          sell_price: l.sell_price,
          notes: l.notes || undefined,
        })),
        cash_amount: p.cash,
        check_amount: p.check,
        check_number: p.checkNumber || undefined,
        cc_amount: p.credit_card,
        // No card transaction reference yet — the Square integration (pending)
        // will capture and supply one when it lands.
        notes: p.notes || undefined,
      });
      persistSale(created);
      setReservation(null); // adopted — the draft row became the sale
      // Cart lines remain visible as the line-item receipt until New Transaction.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sale failed");
    }
  }

  function handleNewTransaction() {
    setLines([]);
    persistSale(null);
    setReservation(null);
    setSquareToken(null);
    setError(null);
    setFormResetKey((k) => k + 1);
  }

  /** Abandons the whole checkout: clears the cart, clears any entered payment
   *  fields (form remount), and returns to lookup state; any reservation is
   *  voided so its display ID retires (issue #12: numbers never reused). Asks
   *  for confirmation while the cart holds items so a full cart cannot be
   *  wiped by a stray click. */
  function handleCancelCheckout() {
    if (
      lines.length > 0 &&
      !window.confirm(
        "Cancel this checkout? All scanned items will be cleared from the cart.",
      )
    )
      return;
    const doomed = reservation;
    setLines([]);
    setReservation(null);
    setSquareToken(null);
    setError(null);
    setFormResetKey((k) => k + 1);
    if (doomed && !doomed.is_finalized) {
      voidSale(doomed.id).catch(() => {
        /* best-effort: the draft is hidden from listings either way */
      });
    }
  }

  const total = lines.reduce((sum, l) => sum + l.sell_price * l.quantity, 0);
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);
  /** Units in the completed sale for the success banner. The sale's own
   *  lines are the source of truth; if the response omits sale_items
   *  (legacy/empty payload), fall back to the cart lines, which remain
   *  on screen as the receipt until New Transaction. */
  const soldItemCount = sale
    ? sale.sale_items.reduce((n, l) => n + l.quantity, 0) || itemCount
    : itemCount;
  /** Single text node so tests and screen readers see one stable string. */
  const soldItemLabel = `${soldItemCount} ${soldItemCount === 1 ? "item" : "items"}`;
  const v2 = useUiVariant() === "v2";

  return (
    <div {...variantProps(v2, "ui2-pos-page", POS_PAGE.root)}>
      <h2>Checkout{eventName ? ` — ${eventName}` : ""}</h2>

      {/* Inline confirmation banner — same screen as the cart. */}
      {sale && (
        <div {...variantProps(v2, "ui2-pos-success", POS_PAGE.successBanner)}>
          <div {...variantProps(v2, "ui2-pos-success-title", POS_PAGE.successTitle)}>
            ✓ Sale Complete!
          </div>
          <div {...variantProps(v2, "ui2-pos-success-line", POS_PAGE.successLine)}>
            Transaction #{sale.transaction_number ?? sale.id} — <strong>${sale.sale_total.toFixed(2)}</strong> —
            {soldItemLabel} —
            Cashier: {sale.created_by ?? "—"}
          </div>
          {eventName && (
            <div {...variantProps(v2, "ui2-pos-success-meta", POS_PAGE.successMetaTop)}>
              Event: <strong>{eventName}</strong>
            </div>
          )}
          <div {...variantProps(v2, "ui2-pos-success-meta", POS_PAGE.successMeta)}>
            {sale.cash_amount > 0 && (
              <span>Cash: ${sale.cash_amount.toFixed(2)} </span>
            )}
            {sale.check_amount > 0 && (
              <span>
                Check: ${sale.check_amount.toFixed(2)}
                {sale.check_number ? ` (#${sale.check_number})` : ""}{" "}
              </span>
            )}
            {sale.cc_amount > 0 && (
              <span>
                Card: ${sale.cc_amount.toFixed(2)}
                {sale.cc_transaction_id
                  ? ` (${sale.cc_transaction_id})`
                  : ""}{" "}
              </span>
            )}
            {sale.cc_fee > 0 && (
              <span>Card fee — historical (3%): ${sale.cc_fee.toFixed(2)} </span>
            )}
          </div>
          <button
            onClick={handleNewTransaction}
            {...variantProps(v2, "ui2-pos-new-btn", POS_PAGE.successNewButton)}
          >
            New Transaction
          </button>
        </div>
      )}

      {/* Sale-submission errors (#14 event feedback) surface at the TOP of the
          transaction panel — at the very bottom (below the payment form) staff
          never saw them. role=alert is an assertive live region. */}
      {error && (
        <div role="alert" {...variantProps(v2, "ui2-pos-error", POS_PAGE.errorBanner)}>
          {error}
        </div>
      )}

      {!sale && (
        <LookupField
          onFound={handleFound}
          focusSignal={focusSignal}
          // LookupField also surfaces its errors inline right below the input;
          // this mirrors them into the top banner so staff looking at the
          // transaction table see sold-out/not-found failures (#14).
          onError={setError}
        />
      )}

      <div {...variantProps(v2, "ui2-pos-cart", POS_PAGE.cartWrap)}>
        <Cart
          lines={lines}
          onUpdate={handleUpdate}
          onRemove={handleRemove}
          readOnly={!!sale}
          transactionNumber={sale?.transaction_number ?? reservation?.transaction_number}
        />
      </div>

      {!sale && (
        <div {...variantProps(v2, "ui2-pos-checkout", POS_PAGE.checkoutRow)}>
          <div {...variantProps(v2, "ui2-pos-checkout-col", POS_PAGE.checkoutCol)}>
            {SQUARE_CARD_ENABLED && !squareToken && (
              <div {...variantProps(v2, "ui2-pos-square-panel", POS_PAGE.squarePanel)}>
                <h4 {...variantProps(v2, "ui2-pos-square-title", POS_PAGE.squareTitle)}>Pay by Card (Square)</h4>
                <SquarePayment
                  onToken={(token) => setSquareToken(token)}
                  onError={(msg) => setError(msg)}
                />
              </div>
            )}
            <PaymentForm
              key={formResetKey}
              total={total}
              itemCount={itemCount}
              onSubmit={handlePayment}
              onCancel={handleCancelCheckout}
            />
          </div>
        </div>
      )}

      {/* My Transactions — the cashier's own sales, read-only. */}
      {!sale && (
        <div {...variantProps(v2, "ui2-pos-history", POS_PAGE.historySection)}>
          <button
            onClick={handleToggleHistory}
            aria-expanded={historyOpen}
            {...variantProps(v2, "ui2-btn ui2-btn--secondary", BUTTON_STYLE)}
          >
            {historyOpen ? "Hide My Transactions" : "My Transactions"}
          </button>
          {historyOpen && (
            <div {...variantProps(v2, "ui2-pos-history-body", POS_PAGE.historyBody)}>
              {historyLoading && (
                <p {...variantProps(v2, "ui2-pos-history-empty", POS_PAGE.historyEmpty)}>
                  Loading transactions…
                </p>
              )}
              {historyError && (
                <p role="alert" {...variantProps(v2, "ui2-pos-history-error", POS_PAGE.historyError)}>
                  {historyError}
                </p>
              )}
              {!historyLoading &&
                !historyError &&
                historySales.length === 0 && (
                  <p {...variantProps(v2, "ui2-pos-history-empty", POS_PAGE.historyEmpty)}>
                    No transactions recorded yet.
                  </p>
                )}
              {historySales.map((s) => (
                <div key={s.id} {...variantProps(v2, "ui2-pos-sale", POS_PAGE.saleCard)}>
                  <div
                    {...variantProps(v2, "ui2-pos-sale-header", POS_PAGE.saleHeader)}
                    onClick={() =>
                      setExpandedSaleId((cur) => (cur === s.id ? null : s.id))
                    }
                    role="button"
                    aria-expanded={expandedSaleId === s.id}
                    aria-label={`transaction ${s.transaction_number ?? s.id} details`}
                  >
                    <span {...variantProps(v2, "ui2-pos-sale-title", POS_PAGE.saleTitle)}>
                      Transaction #{s.transaction_number ?? s.id}
                      {s.is_voided ? " — VOIDED" : ""}
                    </span>
                    <span>
                      {s.sale_items.length} item(s) · ${s.sale_total.toFixed(2)}
                    </span>
                  </div>
                  {expandedSaleId === s.id && (
                    editingSaleId === s.id ? (
                      <TransactionEditor
                        saleId={s.id}
                        onClose={() => setEditingSaleId(null)}
                        onSaved={(updated) =>
                          setHistorySales((prev) =>
                            prev.map((x) => (x.id === updated.id ? updated : x)),
                          )
                        }
                      />
                    ) : (
                    <div {...variantProps(v2, "ui2-pos-sale-body", POS_PAGE.saleBody)}>
                      {!s.is_voided && (
                        <div {...variantProps(v2, "ui2-pos-edit-row", POS_PAGE.editRow)}>
                          <button
                            onClick={() => setEditingSaleId(s.id)}
                            aria-label={`edit sale ${s.transaction_number ?? s.id}`}
                            {...variantProps(v2, "ui2-btn ui2-btn--secondary", POS_PAGE.editButton)}
                          >
                            Edit
                          </button>
                          <span {...variantProps(v2, "ui2-pos-edit-hint", POS_PAGE.editHint)}>
                            correct items, prices, or payments
                          </span>
                        </div>
                      )}
                      <div>
                        Date:{" "}
                        {s.date_of_sale
                          ? new Date(s.date_of_sale).toLocaleString()
                          : "—"}
                      </div>
                      <div {...variantProps(v2, "ui2-pos-pay-line", POS_PAGE.payLine)}>
                        Payment: cash ${s.cash_amount.toFixed(2)} · check $
                        {s.check_amount.toFixed(2)} · card $
                        {s.cc_amount.toFixed(2)}
                      </div>
                      <table {...variantProps(v2, "ui2-pos-items", POS_PAGE.itemsTable)}>
                        <thead>
                          <tr {...v1Only(v2, POS_PAGE.itemsHeadRow)}>
                            <th
                              {...v1Only(v2, POS_PAGE.itemsThLeft)}
                            >
                              Code
                            </th>
                            <th
                              {...variantProps(v2, "ui2-num", POS_PAGE.itemsThRight)}
                            >
                              Qty
                            </th>
                            <th
                              {...variantProps(v2, "ui2-num", POS_PAGE.itemsThRight)}
                            >
                              Unit Price
                            </th>
                            <th
                              {...variantProps(v2, "ui2-num", POS_PAGE.itemsThRight)}
                            >
                              Extended
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.sale_items.map((si) => (
                            <tr
                              key={si.id}
                              {...v1Only(v2, POS_PAGE.itemsBodyRow)}
                            >
                              <td {...v1Only(v2, POS_PAGE.itemsTd)}>
                                {si.item_code ?? "—"}
                                {si.notes && (
                                  <div
                                    {...variantProps(v2, "ui2-pos-item-note", POS_PAGE.itemNote)}
                                  >
                                    Price adj.: {si.notes}
                                  </div>
                                )}
                              </td>
                              <td
                                {...variantProps(v2, "ui2-num", POS_PAGE.itemsTdRight)}
                              >
                                {si.quantity}
                              </td>
                              <td
                                {...variantProps(v2, "ui2-num", POS_PAGE.itemsTdRight)}
                              >
                                ${si.sell_price.toFixed(2)}
                              </td>
                              <td
                                {...variantProps(v2, "ui2-num", POS_PAGE.itemsTdRight)}
                              >
                                ${si.extended_price.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
