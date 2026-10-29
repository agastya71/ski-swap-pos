/**
 * Tests for {@link PaymentForm} — covers field rendering (cash, check, credit
 * card), cash-only and split submissions with check numbers, the explicit 3%
 * card fee (added to the total whenever a card charge is entered), under-tender
 * validation error, credit-card tender, and the Cancel callback. The Square
 * SDK integration is pending and hidden, so no Square-specific fields appear.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentForm } from "./PaymentForm";

/** Tests for the PaymentForm component covering validation and submission behaviour. */
describe("PaymentForm", () => {
  /** Verifies the form renders the sale total and cash/check/credit-card fields. */
  it("shows total owed and cash/check/credit-card fields", () => {
    render(<PaymentForm total={115} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/\$115\.00/)).toBeInTheDocument();
    expect(screen.getByLabelText(/cash/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/check/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/credit card/i)).toBeInTheDocument();
    // No Square-specific fields (integration pending).
    expect(
      screen.queryByText(/pay by card \(square\)/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/card transaction id/i),
    ).not.toBeInTheDocument();
  });

  /** Verifies onSubmit is called with the correct breakdown when the full amount is tendered in cash. */
  it("calls onSubmit with correct payment breakdown for cash-only", () => {
    const onSubmit = vi.fn();
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/cash/i), {
      target: { value: "115" },
    });
    fireEvent.click(screen.getByRole("button", { name: /complete sale/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      cash: 115,
      check: 0,
      credit_card: 0,
      checkNumber: null,
      notes: null,
    });
  });

  /** Verifies onSubmit receives the correct split amounts when both cash and check are entered. */
  it("calls onSubmit with split payment including check number", () => {
    const onSubmit = vi.fn();
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/cash/i), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByLabelText(/check/i), {
      target: { value: "65" },
    });
    fireEvent.change(screen.getByLabelText(/check number/i), {
      target: { value: "1042" },
    });
    fireEvent.click(screen.getByRole("button", { name: /complete sale/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      cash: 50,
      check: 65,
      credit_card: 0,
      checkNumber: "1042",
      notes: null,
    });
  });

  /** Verifies a credit-card tender is included in the submitted breakdown —
   *  the card charge carries the buyer's 3% fee, so charging $115.00 of items
   *  means a $118.45 terminal charge (fee $3.45) covers the total exactly. */
  it("submits a credit-card payment with the fee-inclusive charge", () => {
    const onSubmit = vi.fn();
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/credit card/i), {
      target: { value: "118.45" },
    });
    fireEvent.click(screen.getByRole("button", { name: /complete sale/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      cash: 0,
      check: 0,
      credit_card: 118.45,
      checkNumber: null,
      notes: null,
    });
  });

  /** Verifies the card fee line + fee-inclusive total appear the moment a card
   *  charge is entered ($100 of items, $103.00 terminal charge → fee $3.00). */
  it("shows an explicit card fee line and updates the total", () => {
    render(<PaymentForm total={100} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    // Nothing on card yet → no fee line, total stays at the items subtotal.
    expect(screen.queryByTestId("card-fee-line")).not.toBeInTheDocument();
    expect(screen.getByText(/payment — total: \$100\.00/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/credit card/i), {
      target: { value: "103" },
    });
    const feeLine = screen.getByTestId("card-fee-line");
    expect(feeLine).toHaveTextContent(/items: \$100\.00/i);
    expect(feeLine).toHaveTextContent(/card fee \(3%\): \$3\.00/i);
    expect(feeLine).toHaveTextContent(/buyer total: \$103\.00/i);
    expect(screen.getByText(/payment — total: \$103\.00/i)).toBeInTheDocument();
  });

  /** Verifies under-tender validation compares against the fee-inclusive total:
   *  $100 of items with a $100.00 card charge is short the $2.91 fee. */
  it("shows the short error against the fee-inclusive total", () => {
    render(<PaymentForm total={100} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/credit card/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /complete sale/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /less than total \(\$102\.91\)/i,
    );
  });

  /** Verifies the change-due block uses the fee-inclusive total: $100 of items
   *  with a $200.00 card charge → fee $5.83, total $105.83, change $94.17. */
  it("applies the card fee when computing change due", () => {
    render(<PaymentForm total={100} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/credit card/i), {
      target: { value: "200" },
    });
    expect(
      screen.getByText(/change due to buyer: \$94\.17/i),
    ).toBeInTheDocument();
  });

  /** Verifies a credit-card tender combines with cash in a split payment —
   *  the card carries its $1.95 fee for financing the remaining $65.00
   *  ($66.95 terminal charge) and the split settles exactly. */
  it("submits a split cash + credit-card payment", () => {
    const onSubmit = vi.fn();
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/cash/i), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByLabelText(/credit card/i), {
      target: { value: "66.95" },
    });
    fireEvent.click(screen.getByRole("button", { name: /complete sale/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      cash: 50,
      check: 0,
      credit_card: 66.95,
      checkNumber: null,
      notes: null,
    });
  });

  /** Verifies a check payment without a check number is blocked client-side with a clear message. */
  it("shows error when paying by check without a check number", () => {
    const onSubmit = vi.fn();
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/check/i), {
      target: { value: "115" },
    });
    fireEvent.click(screen.getByRole("button", { name: /complete sale/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /check number is required/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /** Verifies an alert is shown when the tendered amount is less than the sale total. */
  it("shows error when tendered total is less than owed", () => {
    render(<PaymentForm total={115} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/cash/i), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: /complete sale/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /amount tendered.*less than total/i,
    );
  });

  /** Verifies the change-due block appears when the buyer overpays (cash
   *  above the owed total, or a mixed tender exceeding it). */
  it("shows the change due when the buyer overpays", () => {
    render(<PaymentForm total={45} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/cash/i), {
      target: { value: "50" },
    });
    expect(
      screen.getByText(/change due to buyer: \$5\.00/i),
    ).toBeInTheDocument();
  });

  /** Verifies no change-due block when the tender exactly covers the total. */
  it("does not show change due when the tender exactly covers the total", () => {
    render(<PaymentForm total={45} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/cash/i), {
      target: { value: "45" },
    });
    expect(screen.queryByText(/change due/i)).not.toBeInTheDocument();
  });

  /** Verifies the onCancel callback is invoked exactly once when the Cancel button is clicked. */
  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(<PaymentForm total={115} onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

/** Regression: the stale submit error must clear the moment a payment
 *  field is edited (the screenshot bug — "Amount tendered ($0.00) is less
 *  than total ($45.00)" stayed on screen after the cashier filled the
 *  payment and changed the price). */
it("clears the stale error when a payment field is edited", async () => {
  render(<PaymentForm total={45} onSubmit={vi.fn()} onCancel={vi.fn()} />);
  // Submit with empty fields -> the tendered error appears.
  fireEvent.click(screen.getByRole("button", { name: /complete sale/i }));
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent(/amount tendered/i);
  // Editing any payment field clears the stale error.
  fireEvent.change(screen.getByLabelText(/cash/i), {
    target: { value: "50" },
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

/** Verifies the live tendered summary: short → warns, fully covered →
 *  'ready to complete'. */
it("shows a live tendered summary while the payment is entered", async () => {
  render(<PaymentForm total={280} onSubmit={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(/cash/i), {
    target: { value: "250" },
  });
  fireEvent.change(screen.getByLabelText(/check/i), {
    target: { value: "30" },
  });
  const status = await screen.findByRole("status");
  expect(status).toHaveTextContent(/amount tendered: \$280\.00 of \$280\.00/i);
  expect(status).toHaveTextContent(/ready to complete/i);
});
