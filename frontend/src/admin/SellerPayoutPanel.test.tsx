import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { SellerPayoutPanel } from "./SellerPayoutPanel";

describe("SellerPayoutPanel", () => {
  it("shows loading state initially", () => {
    render(<SellerPayoutPanel eventId={1} sellerId={1} />);
    expect(screen.getByText(/loading payout/i)).toBeInTheDocument();
  });

  it("renders payout summary after data loads", async () => {
    render(<SellerPayoutPanel eventId={1} sellerId={1} />);
    await waitFor(() =>
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Items Sold")).toBeInTheDocument();
    expect(screen.getByText("Gross Sales")).toBeInTheDocument();
    // "Due Seller" appears in the summary and as the SALES column heading.
    expect(screen.getAllByText("Due Seller").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$84.00")[0]).toBeInTheDocument();
  });

  /** Verifies the summary amounts sit next to their labels (the table is
   *  shrink-to-fit, overriding the global table { width: 100% } rule). */
  it("keeps the summary amounts next to their labels", async () => {
    render(<SellerPayoutPanel eventId={1} sellerId={1} />);
    await waitFor(() =>
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument(),
    );
    const summaryTable = screen.getByText("Items Consigned").closest("table");
    expect(summaryTable).toHaveStyle({ width: "auto" });
  });

  it("renders the seller information block after data loads", async () => {
    render(<SellerPayoutPanel eventId={1} sellerId={1} />);
    await waitFor(() =>
      expect(screen.getByText("Jane Smith (A001)")).toBeInTheDocument(),
    );
    expect(screen.getByText("612-555-0101")).toBeInTheDocument();
    expect(
      screen.getByText(/Individual — commission 30%/i),
    ).toBeInTheDocument();
  });

  it("renders the Items list and Sales Detail sections after data loads", async () => {
    render(<SellerPayoutPanel eventId={1} sellerId={1} />);
    await waitFor(() =>
      expect(screen.getAllByText("Atomic skis").length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText("Boots").length).toBeGreaterThan(0);
    expect(screen.getAllByText("A001-1").length).toBeGreaterThanOrEqual(2); // Items + Sales Detail (sold)
    expect(screen.getByText("A001-2")).toBeInTheDocument(); // Items only (unsold)
    // Section headings: ONE items list + the retained Sales Detail.
    expect(screen.getByRole("heading", { name: /items/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /sales detail/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /unsold items/i }),
    ).not.toBeInTheDocument();
    // Worksheet-layout columns with BOTH quantity headers (Items table; the
    // Sell Price header also exists in Sales Detail).
    expect(screen.getAllByText(/sell price/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/quantity/i)).toBeInTheDocument();
    expect(screen.getAllByText(/remaining/i).length).toBeGreaterThan(0);
    // Sold row shows remaining 0 and is greyed out (findable via its size,
    // which only appears in the Items row).
    const soldRow = screen.getByText("160cm").closest("tr")!;
    expect(soldRow).toHaveStyle({ color: "#64748b" });
  });

  it("shows error message when API fails", async () => {
    server.use(
      http.get("/reports/:eventId/seller/:sellerId", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 }),
      ),
    );
    render(<SellerPayoutPanel eventId={1} sellerId={1} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  /** The cashier's price-adjustment reason (sale_item.notes) surfaces on the
   *  SALES lines under the item code (Phase D surface (a) — admin UI). */
  it("shows the price-adjustment reason on SALES lines", async () => {
    render(<SellerPayoutPanel eventId={1} sellerId={1} />);
    await waitFor(() =>
      expect(screen.getAllByText("Atomic skis").length).toBeGreaterThan(0),
    );
    expect(
      screen.getByText(/Price adj.: Zipper broken - \$5 off/),
    ).toBeInTheDocument();
  });
});
