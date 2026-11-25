/**
 * Post-sale confirmation screen — displays a receipt summary after a successful
 * transaction and provides a 'New Transaction' button to reset the POS.
 *
 * @module ConfirmationScreen
 */
import type { SaleWithItemsResponse } from "../types";
import { CONFIRM, variantProps } from "./posStyles";
import { useUiVariant } from "../lib/uiVariant";

/**
 * Displays a receipt summary including sale ID, item count, total, and per-tender
 * breakdown (cash, check, card). The 'New Transaction' button resets the POS flow.
 *
 * @param props.sale - The completed sale returned from the API, including all line items and tender amounts.
 * @param props.onNewTransaction - Callback invoked when the cashier clicks 'New Transaction' to start fresh.
 */
export function ConfirmationScreen({
  sale,
  onNewTransaction,
}: {
  sale: SaleWithItemsResponse;
  onNewTransaction: () => void;
}) {
  const count = sale.sale_items.length;
  const v2 = useUiVariant() === "v2";
  return (
    <div {...variantProps(v2, "ui2-confirm", CONFIRM.container)}>
      <div {...variantProps(v2, "ui2-confirm-mark", CONFIRM.mark)}>✓</div>
      <h2>Sale Complete!</h2>
      <p {...variantProps(v2, "ui2-confirm-count", CONFIRM.count)}>
        Sale #{sale.id} — {count} item{count !== 1 ? "s" : ""}
      </p>
      <p {...variantProps(v2, "ui2-confirm-total", CONFIRM.total)}>
        ${sale.sale_total.toFixed(2)}
      </p>
      <div {...variantProps(v2, "ui2-confirm-tenders", CONFIRM.tenders)}>
        {sale.cash_amount > 0 && (
          <div>Cash: ${sale.cash_amount.toFixed(2)}</div>
        )}
        {sale.check_amount > 0 && (
          <div>Check: ${sale.check_amount.toFixed(2)}</div>
        )}
        {sale.cc_amount > 0 && <div>Card: ${sale.cc_amount.toFixed(2)}</div>}
        {sale.balance_due < 0 && (
          <div {...variantProps(v2, "ui2-confirm-change", CONFIRM.change)}>
            Change given: ${(-sale.balance_due).toFixed(2)}
          </div>
        )}
      </div>
      <button
        onClick={onNewTransaction}
        {...variantProps(v2, "ui2-confirm-new", CONFIRM.newButton)}
      >
        New Transaction
      </button>
    </div>
  );
}
