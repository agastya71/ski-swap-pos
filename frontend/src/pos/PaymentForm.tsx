/**
 * Payment entry form — splits tender across cash, check, and credit card
 * (entered manually — the Square integration is pending), collects the check
 * number (when paying by check) and free-text sale notes, validates that the
 * total tendered meets the sale total, and submits.
 *
 * @module PaymentForm
 */
import { useState, type FormEvent } from "react";
import { BUTTON_STYLE } from "../lib/buttons";

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
 * @param props.total - Sale total in dollars; tendered amounts must sum to at least this value.
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
    const tendered = cashAmt + checkAmt + ccAmt;

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
            <h3>Payment — Total: ${total.toFixed(2)}</h3>
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
                    onChange={(e) => setCash(e.target.value)}
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
                    onChange={(e) => setCheck(e.target.value)}
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
                        onChange={(e) => setCheckNumber(e.target.value)}
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
                    onChange={(e) => setCreditCard(e.target.value)}
                    style={{ padding: 8, fontSize: 16, width: 140 }}
                />
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
                    onChange={(e) => setNotes(e.target.value)}
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
