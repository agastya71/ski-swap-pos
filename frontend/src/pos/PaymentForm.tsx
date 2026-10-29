/**
 * Payment entry form — splits tender across cash, check, and credit card
 * (entered manually — the Square integration is pending), collects the check
 * number (when paying by check) and free-text sale notes, adds an explicit 3%
 * card transaction fee to the total when the buyer charges any amount to a
 * card, validates that the total tendered meets the sale total, and submits.
 *
 * @module PaymentForm
 */
import { useState, type FormEvent } from "react";
import { BUTTON_STYLE } from "../lib/buttons";

/** Buyer-paid card transaction fee (2026-10-28): the card terminal charge
 *  INCLUDES the fee (terminal runs for items×1.03 on the card portion), so the
 *  fee decodes from the charge — must mirror the backend's compute_card_fee. */
const CC_FEE_RATE = 0.03;

function computeCardFee(ccAmount: number): number {
    if (ccAmount <= 0) return 0;
    return Math.round((ccAmount * CC_FEE_RATE) / (1 + CC_FEE_RATE) * 100) / 100;
}

export interface PaymentSubmit {
    cash: number;
    check: number;
    /** Amount tendered by credit/debit card, entered manually. The Square
     *  integration (pending) will capture this amount and supply a
     *  transaction id later. Includes the card fee charged to the buyer. */
    credit_card: number;
    checkNumber: string | null;
    notes: string | null;
}

/**
 * Collects cash, check (+ check number), and credit-card tender. Validates
 * before submit that: a check number is present for check payment and the
 * sum of tender meets the sale total (line items plus the 3% card fee when a
 * card is used) — surfaced as field-level errors without a server round-trip.
 *
 * @param props.total - Item subtotal in dollars (sum of the cart lines); the
 *   card fee is added on top when any amount is charged to a card.
 * @param props.onSubmit - Callback with the full payment breakdown once validation passes.
 * @param props.onCancel - Callback invoked when the cashier clicks Cancel.
 */
export function PaymentForm({
    total,
    onSubmit,
    onCancel,
}: {
    total: number;
    onSubmit: (payment: PaymentSubmit) => void;
    onCancel: () => void;
}) {
    const [cash, setCash] = useState("");
    const [check, setCheck] = useState("");
    const [checkNumber, setCheckNumber] = useState("");
    const [creditCard, setCreditCard] = useState("");
    const [notes, setNotes] = useState("");
    const [error, setError] = useState<string | null>(null);

    const cashAmt = parseFloat(cash) || 0;
    const checkAmt = parseFloat(check) || 0;
    const ccAmt = parseFloat(creditCard) || 0;
    const cardFee = computeCardFee(ccAmt);
    const grandTotal = total + cardFee;
    const tendered = cashAmt + checkAmt + ccAmt;

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
        if (tendered < grandTotal - 0.001) {
            setError(
                `Amount tendered ($${tendered.toFixed(2)}) is less than total ($${grandTotal.toFixed(2)}).`,
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
            <h3>Payment — Total: ${grandTotal.toFixed(2)}</h3>
            {(cardFee > 0 || ccAmt > 0) && (
                <div
                    role="status"
                    data-testid="card-fee-line"
                    style={{ marginBottom: 12, fontSize: 14 }}
                >
                    Items: ${total.toFixed(2)} · Card fee (3%): ${cardFee.toFixed(2)} ·
                    Buyer total: ${grandTotal.toFixed(2)}
                </div>
            )}
            <div style={{ marginBottom: 12 }}>
                <label
                    htmlFor="cash"
                    style={{ display: "block", marginBottom: 4 }}
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
                    style={{ padding: 8, fontSize: 16, width: 140 }}
                />
            </div>
            <div style={{ marginBottom: 12 }}>
                <label
                    htmlFor="check"
                    style={{ display: "block", marginBottom: 4 }}
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
                    style={{ padding: 8, fontSize: 16, width: 140 }}
                />
            </div>
            {checkAmt > 0 && (
                <div style={{ marginBottom: 12 }}>
                    <label
                        htmlFor="checkNumber"
                        style={{ display: "block", marginBottom: 4 }}
                    >
                        Check Number
                    </label>
                    <input
                        id="checkNumber"
                        type="text"
                        value={checkNumber}
                        onChange={updatePayment(setCheckNumber)}
                        style={{ padding: 8, fontSize: 16, width: 200 }}
                    />
                </div>
            )}
            <div style={{ marginBottom: 12 }}>
                <label
                    htmlFor="creditCard"
                    style={{ display: "block", marginBottom: 4 }}
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
                    style={{ padding: 8, fontSize: 16, width: 140 }}
                />
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                    Amount run on the card (includes the 3% fee — e.g. $100.00
                    of items → $103.00 charge)
                </div>
            </div>
            <div style={{ marginBottom: 12 }}>
                <label
                    htmlFor="saleNotes"
                    style={{ display: "block", marginBottom: 4 }}
                >
                    Sale notes (optional, printed on receipt)
                </label>
                <textarea
                    id="saleNotes"
                    value={notes}
                    onChange={updatePayment(setNotes)}
                    rows={2}
                    style={{
                        width: "100%",
                        padding: 8,
                        fontSize: 14,
                        boxSizing: "border-box",
                    }}
                />
            </div>
            {error && (
                <div role="alert" style={{ color: "red", marginBottom: 10 }}>
                    {error}
                </div>
            )}
            {!error && tendered > 0 && (
                <div
                    role="status"
                    style={{
                        marginBottom: 10,
                        padding: 8,
                        borderRadius: 4,
                        fontSize: 14,
                        border:
                            tendered + 0.001 >= total
                                ? "1px solid #86efac"
                                : "1px solid #fca5a5",
                        background:
                            tendered + 0.001 >= total ? "#f0fdf4" : "#fef2f2",
                        color:
                            tendered + 0.001 >= total ? "#166534" : "#b91c1c",
                    }}
                >
                    Amount tendered: ${tendered.toFixed(2)} of $
                    {grandTotal.toFixed(2)}
                    {tendered - 0.001 > grandTotal
                        ? " — ✓ payment covers total"
                        : tendered + 0.001 >= grandTotal
                          ? " — ✓ ready to complete"
                          : ` — $${(grandTotal - tendered).toFixed(2)} short`}
                </div>
            )}
            {!error && tendered - 0.001 > grandTotal && (
                <div
                    role="status"
                    style={{
                        marginBottom: 10,
                        padding: "10px 12px",
                        borderRadius: 4,
                        fontSize: 17,
                        fontWeight: 700,
                        border: "1px solid #86efac",
                        background: "#f0fdf4",
                        color: "#15803d",
                    }}
                >
                    Change due to buyer: ${(tendered - grandTotal).toFixed(2)}
                </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
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
