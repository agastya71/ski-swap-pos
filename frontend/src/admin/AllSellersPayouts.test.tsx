/**
 * Tests for {@link AllSellersPayouts} — batch payouts fetch, grand totals,
 * per-seller cards with download buttons, and the ZIP download trigger.
 *
 * @module AllSellersPayouts.test
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { server } from "../mocks/server";
import { http, HttpResponse } from "msw";
import { vi, afterEach } from "vitest";
import { AllSellersPayouts } from "./AllSellersPayouts";

/** Stub the blob-download APIs jsdom lacks (mirrors the production flow). */
function stubBlobDownload() {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
        value: createObjectURL,
        configurable: true,
        writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
        value: revokeObjectURL,
        configurable: true,
        writable: true,
    });
    return { createObjectURL, revokeObjectURL };
}

describe("AllSellersPayouts", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** Verifies the batch report loads with grand totals and per-seller cards. */
    it("loads batch payouts with grand totals and per-seller cards", async () => {
        render(<AllSellersPayouts eventId={1} />);
        await waitFor(() =>
            expect(
                screen.getAllByText("Jane Smith (A001)").length,
            ).toBeGreaterThan(0),
        );
        expect(screen.getByText("Sellers")).toBeInTheDocument();
        // $120.00 appears twice (grand totals + per-seller card).
        expect(screen.getAllByText("$120.00").length).toBeGreaterThan(0);
        // Per-seller card sections.
        expect(
            screen.getAllByRole("heading", { name: /sales/i }).length,
        ).toBeGreaterThan(0);
        expect(screen.getByText("A001-2")).toBeInTheDocument();
  });

    /** Verifies the grand-total rows sit next to their labels (shrink-to-fit). */
    it("keeps the batch summary amounts next to their labels", async () => {
        render(<AllSellersPayouts eventId={1} />);
        await waitFor(() =>
            expect(
                screen.getAllByText("Jane Smith (A001)").length,
            ).toBeGreaterThan(0),
        );
        const summaryTable = screen.getByText("Sellers").closest("table");
        expect(summaryTable).toHaveStyle({ width: "auto" });
    });

    /** Verifies the per-seller Download XLSX button triggers a download. */
    it("downloads a per-seller xlsx", async () => {
        const { createObjectURL } = stubBlobDownload();
        server.use(
            http.get(
                "/reports/:eventId/seller/:sellerId",
                () =>
                    new HttpResponse("xlsx-bytes", {
                        headers: {
                            "Content-Type":
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        },
                    }),
            ),
        );
        render(<AllSellersPayouts eventId={1} />);
        await waitFor(() =>
            expect(
                screen.getByLabelText(/download xlsx payout for A001/i),
            ).toBeInTheDocument(),
        );
        fireEvent.click(
            screen.getByLabelText(/download xlsx payout for A001/i),
        );
        await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    });

    /** Verifies the ZIP download button fetches the zip endpoint. */
    it("downloads the all-sellers zip", async () => {
        const { createObjectURL } = stubBlobDownload();
        let zipUrl = "";
        server.use(
            http.get(
                "/reports/:eventId/sellers-payouts/export-zip",
                ({ request }) => {
                    zipUrl = request.url;
                    return new HttpResponse("zip-bytes", {
                        headers: { "Content-Type": "application/zip" },
                    });
                },
            ),
        );
        render(<AllSellersPayouts eventId={1} />);
        await waitFor(() =>
            expect(
                screen.getByLabelText(/download zip of all seller payouts/i),
            ).toBeInTheDocument(),
        );
        fireEvent.click(
            screen.getByLabelText(/download zip of all seller payouts/i),
        );
        await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
        expect(zipUrl).toContain("/sellers-payouts/export-zip");
    });

    /** Verifies a server error is surfaced as an inline alert message. */
    it("shows an error when the batch fetch fails", async () => {
        server.use(
            http.get("/reports/:eventId/sellers-payouts", () =>
                HttpResponse.json(
                    { detail: "No active event configured" },
                    { status: 503 },
                ),
            ),
        );
        render(<AllSellersPayouts eventId={1} />);
        await waitFor(() =>
            expect(screen.getByRole("alert")).toHaveTextContent(
                /no active event/i,
            ),
        );
    });
});
