import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { SellerEquipmentSummaryPanel } from "./SellerEquipmentSummaryPanel";

const SUMMARY = {
    event_id: 1,
    event_name: "TEST SWAP POS 2026",
    seller_code: "VEND1",
    seller_name: "Summary Vendor",
    company: "Summary Vendor",
    vendor_commission_rate: 0.3,
    categories: [
        {
            category: "Skis",
            items_consigned: 2,
            units_sold: 2,
            gross_sales: 150,
            mysl_share: 45,
            seller_share: 105,
            units_unsold: 1,
            unsold_value: 100,
        },
        {
            category: "Boots",
            items_consigned: 1,
            units_sold: 0,
            gross_sales: 0,
            mysl_share: 0,
            seller_share: 0,
            units_unsold: 1,
            unsold_value: 50,
        },
    ],
    total: {
        category: "TOTAL",
        items_consigned: 3,
        units_sold: 2,
        gross_sales: 150,
        mysl_share: 45,
        seller_share: 105,
        units_unsold: 2,
        unsold_value: 150,
    },
    generated_at: "2026-09-18T10:00:00",
};

/** SellerEquipmentSummaryPanel — on-demand vendor summary by equipment type. */
describe("SellerEquipmentSummaryPanel", () => {
    /** The report is generated on demand: nothing loads until the button is clicked. */
    it("shows the button first and fetches only on demand", async () => {
        server.use(
            http.get("/reports/1/vendor/5/equipment-summary", () =>
                HttpResponse.json(SUMMARY),
            ),
        );
        render(<SellerEquipmentSummaryPanel eventId={1} sellerId={5} />);
        // No summary yet — only the trigger button.
        expect(screen.getByText(/show equipment summary/i)).toBeInTheDocument();
        expect(screen.queryByText("Skis")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /show equipment summary/i }));
        await waitFor(() =>
            expect(screen.queryByText(/loading/i)).not.toBeInTheDocument(),
        );
        expect(screen.getByText("Skis")).toBeInTheDocument();
        expect(screen.getByText("Boots")).toBeInTheDocument();
        expect(screen.getByText("TOTAL")).toBeInTheDocument();
        // $150.00 appears 3×: Skis gross, TOTAL gross, TOTAL unsold value.
        expect(screen.getAllByText("$150.00")).toHaveLength(3);
        // Vendor payout of $105 appears for Skis and the TOTAL.
        expect(screen.getAllByText("$105.00")).toHaveLength(2);
    });

    it("shows an error when the report request fails", async () => {
        server.use(
            http.get("/reports/1/vendor/5/equipment-summary", () =>
                HttpResponse.json(
                    { detail: "Seller is not a vendor" },
                    { status: 422 },
                ),
            ),
        );
        render(<SellerEquipmentSummaryPanel eventId={1} sellerId={5} />);
        fireEvent.click(screen.getByRole("button", { name: /show equipment summary/i }));
        expect(await screen.findByRole("alert")).toHaveTextContent(
            /seller is not a vendor/i,
        );
    });
});