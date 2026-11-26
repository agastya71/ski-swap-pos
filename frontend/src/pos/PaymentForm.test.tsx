/**
 * Tests for {@link PaymentForm} — covers field rendering (cash, check, credit
 * card), cash-only and split submissions with check numbers, plain card tender
 * (the 3% buyer fee was removed 2026-11-24, event feedback #7 — card charges
 * are taken at face value), under-tender validation error, and the Cancel
 * callback. The Square SDK integration is pending and hidden, so no
 * Square-specific fields appear.
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
    expect(screen.queryByLabelText(/card transaction id/i),
    ).not.toBeInTheDocument();
  });

  /** Omitted itemCount = no item-count label (legacy callers stay intact). */
  it("omits the item-count label when itemCount is not provided", () => {
    render(<PaymentForm total={115} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/payment — total/i)).toBeInTheDocument();
  });

  /** Running item count (m03749) renders next to the money total. */
  it("shows running item count next to the total", () => {
    render(<PaymentForm total={115} itemCount={5} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/payment — 5 items · total/i)).toBeInTheDocument();
  });

  it("uses singular wording for one item", () => {
    render(<PaymentForm total={115} itemCount={1} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/payment — 1 item · total/i)).toBeInTheDocument();
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
   *  with the fee removed, the card charge is taken at face value: a $115.00
   *  charge on $115.00 of items covers the total exactly. */
  it("submits a credit-card payment with the plain charge", () => {
    const onSubmit = vi.fn();
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/credit card/i), {
      target: { value: "115" },
    });
    fireEvent.click(screen.getByRole("button", { name: /complete sale/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      cash: 0,
      check: 0,
      credit_card: 115,
      checkNumber: null,
      notes: null,
    });
  });

  /** Verifies NO card fee line exists anymore (fee removed, #7) and the
   *  header total stays the plain item subtotal even with a card charge. */
  it("shows no card fee line and keeps the plain total", () => {
    render(<PaymentForm total={100} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/credit card/i), {
      target: { value: "103" },
    });
    expect(screen.queryByTestId("card-fee-line")).not.toBeInTheDocument();
    expect(screen.getByText(/payment — total: \$100\.00/i)).toBeInTheDocument();
  });

  /** Verifies under-tender validation compares against the plain total
   *  (no fee term since #7): $100 of items, $100 card charge settles fully. */
  it("accepts an exact card tender against the plain total", () => {
    render(<PaymentForm total={100} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/credit card/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /complete sale/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  /** Verifies the change-due block uses the plain total (no fee since #7):
   *  $100 of items with a $200.00 card charge → change $100.00. */
  it("applies the plain total when computing change due", () => {
    render(<PaymentForm total={100} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/credit card/i), {
      target: { value: "200" },
    });
    expect(
      screen.getByText(/change due to buyer: \$100\.00/i),
    ).toBeInTheDocument();
  });

  /** Verifies a credit-card tender combines with cash in a split payment —
   *  plain amounts, no fee term: $50 cash + $65.00 card covers $115.00. */
  it("submits a split cash + credit-card payment", () => {
    const onSubmit = vi.fn();
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/cash/i), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByLabelText(/credit card/i), {
      target: { value: "65" },
    });
    fireEvent.click(screen.getByRole("button", { name: /complete sale/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      cash: 50,
      check: 0,
      credit_card: 65,
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
