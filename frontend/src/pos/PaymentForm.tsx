/**
 * Payment entry form — splits tender across cash, check, and credit card
 * (entered manually — the Square integration is pending), collects the check
 * number (when paying by check) and free-text sale notes, validates that the
 * total tendered meets the sale total, and submits.
 *
 * Card fee (removed 2026-11-24, event feedback #7): buyers no longer pay a
 * 3% surcharge — the card terminal charge is the plain amount of the card
 * tender. The backend `cc_fee` column remains for historical sale rows only.
 *
 * @module PaymentForm
 */
import { useState, type FormEvent } from "react";
import { BUTTON_STYLE } from "../lib/buttons";
import { PAY, variantProps } from "./posStyles";
import { useUiVariant } from "../lib/uiVariant";

export interface PaymentSubmit {
    cash: number;
    check: number;
    /** Amount tendered by credit/debit card, entered manually. The Square
     *  integration (pending) will capture this amount and supply a
     *  transaction id later. */
    credit_card: number;
    checkNumber: string | null;
    notes: string | null;
}

/**
 * Collects cash, check (+ check number), and credit-card tender. Validates
 * before submit that: a check number is present for check payment and the
 * sum of tender meets the sale total — surfaced as field-level errors
 * without a server round-trip.
 *
 * @param props.total - Sale total in dollars (sum of the cart lines).
 * @param props.onSubmit - Callback with the full payment breakdown once validation passes.
 * @param props.onCancel - Callback invoked when the cashier clicks Cancel.
 */
export function PaymentForm({
    total,
    itemCount,
    onSubmit,
    onCancel,
}: {
    total: number;
    /** Running total of item units in the sale (qty summed) — shown next
     *  to the money total; optional because legacy callers/tests omit it. */
    itemCount?: number;
    onSubmit: (payment: PaymentSubmit) => void;
    onCancel: () => void;
}) {
    const [cash, setCash] = useState("");
    const [check, setCheck] = useState("");
    const [checkNumber, setCheckNumber] = useState("");
    const [creditCard, setCreditCard] = useState("");
    const [notes, setNotes] = useState("");
    const [error, setError] = useState<string | null>(null);
    const v2 = useUiVariant() === "v2";

    const cashAmt = parseFloat(cash) || 0;
    const checkAmt = parseFloat(check) || 0;
    const ccAmt = parseFloat(creditCard) || 0;
    const tendered = cashAmt + checkAmt + ccAmt;
    const itemLabel = itemCount != null ? `${itemCount} ${itemCount === 1 ? "item" : "items"} · ` : "";

    /** Clears any stale submit error the moment the cashier edits a payment
     *  field — the red box used to persist until the next submit, showing
     *  amounts and totals that no longer matched the form. */
    function updatePayment(setter: (v: string) => void) {
        return (e: { target: { value: string } }) => {
            setError(null);
            setter(e.target.value);
        };
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        if (checkAmt > 0 && !checkNumber.trim()) {
            setError("Check number is required for check payments.");
            return;
        }
        if (tendered < total - 0.001) {
            setError(
                `Amount tendered ($${tendered.toFixed(2)}) is less than total ($${total.toFixed(2)}).`,
            );
            return;
        }
        onSubmit({
            cash: cashAmt,
            check: checkAmt,
            credit_card: ccAmt,
            checkNumber: checkAmt > 0 ? checkNumber.trim() || null : null,
            notes: notes.trim() || null,
        });
    }

    return (
        <form onSubmit={handleSubmit}>
            <h3>Payment — {itemLabel}Total: ${total.toFixed(2)}</h3>
            <div {...variantProps(v2, "ui2-pay-field", PAY.field)}>
                <label
                    htmlFor="cash"
                    {...variantProps(v2, "ui2-pay-label", PAY.label)}
                >
                    Cash ($)
                </label>
                <input
                    id="cash"
                    type="number"
                    min="0"
                    step="0.01"
                    value={cash}
                    onChange={updatePayment(setCash)}
                    {...variantProps(v2, "ui2-pay-input ui2-pay-input--money", PAY.inputMoney)}
                />
            </div>
            <div {...variantProps(v2, "ui2-pay-field", PAY.field)}>
                <label
                    htmlFor="check"
                    {...variantProps(v2, "ui2-pay-label", PAY.label)}
                >
                    Check ($)
                </label>
                <input
                    id="check"
                    type="number"
                    min="0"
                    step="0.01"
                    value={check}
                    onChange={updatePayment(setCheck)}
                    {...variantProps(v2, "ui2-pay-input ui2-pay-input--money", PAY.inputMoney)}
                />
            </div>
            {checkAmt > 0 && (
                <div {...variantProps(v2, "ui2-pay-field", PAY.field)}>
                    <label
                        htmlFor="checkNumber"
                        {...variantProps(v2, "ui2-pay-label", PAY.label)}
                    >
                        Check Number
                    </label>
                    <input
                        id="checkNumber"
                        type="text"
                        value={checkNumber}
                        onChange={updatePayment(setCheckNumber)}
                        {...variantProps(v2, "ui2-pay-input ui2-pay-input--check-number", PAY.inputCheckNumber)}
                    />
                </div>
            )}
            <div {...variantProps(v2, "ui2-pay-field", PAY.field)}>
                <label
                    htmlFor="creditCard"
                    {...variantProps(v2, "ui2-pay-label", PAY.label)}
                >
                    Credit Card ($)
                </label>
                <input
                    id="creditCard"
                    type="number"
                    min="0"
                    step="0.01"
                    value={creditCard}
                    onChange={updatePayment(setCreditCard)}
                    {...variantProps(v2, "ui2-pay-input ui2-pay-input--money", PAY.inputMoney)}
                />
                <div {...variantProps(v2, "ui2-pay-hint", PAY.hint)}>
                    Amount run on the card (charged to the buyer as entered)
                </div>
            </div>
            <div {...variantProps(v2, "ui2-pay-field", PAY.field)}>
                <label
                    htmlFor="saleNotes"
                    {...variantProps(v2, "ui2-pay-label", PAY.label)}
                >
                    Sale notes (optional, printed on receipt)
                </label>
                <textarea
                    id="saleNotes"
                    value={notes}
                    onChange={updatePayment(setNotes)}
                    rows={2}
                    {...variantProps(v2, "ui2-pay-notes", PAY.notes)}
                />
            </div>
            {error && (
                <div role="alert" {...variantProps(v2, "ui2-pay-error", PAY.error)}>
                    {error}
                </div>
            )}
            {!error && tendered > 0 && (
                <div
                    role="status"
                    {...variantProps(
                        v2,
                        `ui2-pay-status ${tendered + 0.001 >= total ? "ui2-pay-status--ok" : "ui2-pay-status--short"}`,
                        PAY.status(tendered + 0.001 >= total),
                    )}
                >
                    Amount tendered: ${tendered.toFixed(2)} of $
                    {total.toFixed(2)}
                    {tendered - 0.001 > total
                        ? " — ✓ payment covers total"
                        : tendered + 0.001 >= total
                          ? " — ✓ ready to complete"
                          : ` — $${(total - tendered).toFixed(2)} short`}
                </div>
            )}
            {!error && tendered - 0.001 > total && (
                <div
                    role="status"
                    {...variantProps(v2, "ui2-pay-change", PAY.changeDue)}
                >
                    Change due to buyer: ${(tendered - total).toFixed(2)}
                </div>
            )}
            <div {...variantProps(v2, "ui2-pay-actions", PAY.actions)}>
                <button
                    type="submit"
                    disabled={total <= 0}
                    style={BUTTON_STYLE}
                >
                    Complete Sale
                </button>
                <button type="button" onClick={onCancel} style={BUTTON_STYLE}>
                    Cancel
                </button>
            </div>
        </form>
    );
}
