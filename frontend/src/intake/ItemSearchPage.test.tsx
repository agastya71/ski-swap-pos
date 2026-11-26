/**
 * Tests for {@link ItemSearchPage} — initial full-list load, full-field search
 * submission, status filter re-search, empty results message, error surfacing,
 * and the Excel export download trigger.
 *
 * @module ItemSearchPage.test
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { server } from "../mocks/server";
import { http, HttpResponse } from "msw";
import { vi, afterEach } from "vitest";
import { ItemSearchPage } from "./ItemSearchPage";
import { AuthProvider } from "../auth/AuthContext";
import { setToken } from "../api/client";
import {
    ADMIN_TOKEN,
    INTAKE_TOKEN,
} from "../mocks/tokens";
import type { ItemSearchResult } from "../types";

/** Wraps a flat item array in the paged IntakeSearchPage envelope. */
const pageOf = (items: unknown[], total = items.length) => ({
    total,
    limit: 100,
    offset: 0,
    items,
});

const RESULT_A: ItemSearchResult = {
    id: 1,
    intake_id: 1,
    seller_id: 1,
    code: "A001-01",
    category: "Skis",
    brand: "Rossignol",
    type: "Alpine Ski",
    description: "Red alpine skis",
    color: "Red",
    size: "140cm",
    uom: null,
    gender_age: "Kids'",
    year: 2018,
    used: true,
    price: 75,
    quantity: 2,
    remaining: 1,
    barcode_39: null,
    label_line_2: null,
    label_line_3: null,
    donate_unsold: false,
    status: "sold",
    label_printed: false,
    is_deleted: false,
    vendor_item_id: null,
    created_at: "2026-04-04T10:00:00",
    seller_code: "A001",
    seller_name: "Jane Smith",
};
const RESULT_B: ItemSearchResult = {
    ...RESULT_A,
    id: 2,
    code: "A002-01",
    description: "Blue snowboard boots",
    brand: "Atomic",
    category: "Boots",
    color: "Blue",
    seller_code: "A002",
    seller_name: "Pioneer Sports",
};

/** Stub the blob-download APIs jsdom lacks (mirrors production download flow). */
function stubBlobDownload() {
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
        blobs.push(blob);
        return "blob:mock-url";
    });
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
    return { createObjectURL, blobs, revokeObjectURL };
}

describe("ItemSearchPage", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        setToken(null);
    });

    /** Renders the page inside AuthProvider with the given role's token. */
    function renderPage(role: "admin" | "intake") {
        setToken(role === "admin" ? ADMIN_TOKEN : INTAKE_TOKEN);
        return render(
            <AuthProvider>
                <ItemSearchPage />
            </AuthProvider>,
        );
    }

    /** Verifies the full item list loads on mount (empty search query). */
    it("loads all items on mount", async () => {
        server.use(
            http.get("/items/intake-search", () =>
                HttpResponse.json(pageOf([RESULT_A, RESULT_B])),
            ),
        );
        renderPage("admin");
        await waitFor(() =>
            expect(screen.getByText("A001-01")).toBeInTheDocument(),
        );
        expect(screen.getByText("A002-01")).toBeInTheDocument();
        expect(screen.getByText(/2 items found/i)).toBeInTheDocument();
        // Seller info is shown alongside each item.
        expect(screen.getByText(/A001 — Jane Smith/)).toBeInTheDocument();
    });

    /** The reported bug: with >100 matches, the count line shows the SERVER
     *  total (not the page length) and a pager appears with working bounds. */
    it("shows server total + pager when matches exceed the page size", async () => {
        const bigPage = Array.from({ length: 100 }, (_, i) => ({
            ...RESULT_A,
            id: i + 1,
            code: `PG-${String(i).padStart(3, "0")}`,
        }));
        server.use(
            http.get("/items/intake-search", ({ request }) =>
                HttpResponse.json({
                    total: 1290,
                    limit: 100,
                    offset: Number(new URL(request.url).searchParams.get("offset") ?? 0),
                    items: bigPage,
                }),
            ),
        );
        renderPage("admin");
        await waitFor(() =>
            expect(screen.getByText(/1,?290 items found/i)).toBeInTheDocument(),
        );
        expect(screen.getByText(/1–100 of 1,?290/)).toBeInTheDocument();
        const prev = screen.getByRole("button", { name: /previous/i });
        expect(prev).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: /next/i }));
        await waitFor(() => expect(screen.getByText(/101–200 of 1,?290/)).toBeInTheDocument());
        expect(screen.getByRole("button", { name: /previous/i })).toBeEnabled();
    });

    /** Verifies submitting the search form calls the API with the typed query. */
    it("submits the search query and shows filtered results", async () => {
        let queried = "";
        server.use(
            http.get("/items/intake-search", ({ request }) => {
                queried = new URL(request.url).searchParams.get("q") ?? "";
                return HttpResponse.json(pageOf([RESULT_B]));
            }),
        );
        renderPage("admin");
        await waitFor(() =>
            expect(
                screen.getByLabelText(/search all fields/i),
            ).toBeInTheDocument(),
        );
        fireEvent.change(screen.getByLabelText(/search all fields/i), {
            target: { value: "rossignol" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
        await waitFor(() => expect(queried).toBe("rossignol"));
        expect(screen.getByText("A002-01")).toBeInTheDocument();
    });

    /** Verifies changing the status filter re-runs the search with the status param. */
    it("re-runs the search when the status filter changes", async () => {
        let statusParam = "";
        server.use(
            http.get("/items/intake-search", ({ request }) => {
                statusParam =
                    new URL(request.url).searchParams.get("status") ?? "";
                return HttpResponse.json(pageOf([]));
            }),
        );
        renderPage("admin");
        await waitFor(() =>
            expect(screen.getByLabelText(/status/i)).toBeInTheDocument(),
        );
        fireEvent.change(screen.getByLabelText(/status/i), {
            target: { value: "sold" },
        });
        await waitFor(() => expect(statusParam).toBe("sold"));
        expect(screen.getByText(/no items match/i)).toBeInTheDocument();
    });

    /** Verifies a server error is surfaced as an inline alert message. */
    it("shows an error when the search fails", async () => {
        server.use(
            http.get("/items/intake-search", () =>
                HttpResponse.json(
                    { detail: "No active event configured" },
                    { status: 503 },
                ),
            ),
        );
        renderPage("admin");
        await waitFor(() =>
            expect(screen.getByRole("alert")).toHaveTextContent(
                /no active event/i,
            ),
        );
    });

    /** Verifies the export button downloads an xlsx of the current search. */
    it("downloads an Excel export of the current results", async () => {
        const { createObjectURL, blobs } = stubBlobDownload();
        let exportUrl = "";
        server.use(
            http.get("/items/intake-search/export", ({ request }) => {
                exportUrl = request.url;
                return new HttpResponse("excel-bytes", {
                    headers: {
                        "Content-Type":
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    },
                });
            }),
        );
        renderPage("admin");
        await waitFor(() =>
            expect(
                screen.getByLabelText(/search all fields/i),
            ).toBeInTheDocument(),
        );
        fireEvent.change(screen.getByLabelText(/search all fields/i), {
            target: { value: "skis" },
        });
        fireEvent.click(
            screen.getByRole("button", { name: /download results/i }),
        );
        await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
        expect(exportUrl).toContain("q=skis");
        expect(blobs.length).toBe(1);
        expect(blobs[0]).toBeInstanceOf(Blob);
        expect(blobs[0].size).toBeGreaterThan(0);
    });

    /** Verifies admins see the four column-filter inputs and can filter by them. */
    it("shows column filter inputs for admins and sends them as params", async () => {
        let categoryParam = "";
        let brandParam = "";
        server.use(
            http.get("/items/intake-search", ({ request }) => {
                const params = new URL(request.url).searchParams;
                if (params.get("category")) {
                    categoryParam = params.get("category") ?? "";
                    brandParam = params.get("brand") ?? "";
                }
                return HttpResponse.json(pageOf([RESULT_A]));
            }),
        );
        renderPage("admin");
        await waitFor(() =>
            expect(screen.getByText("A001-01")).toBeInTheDocument(),
        );
        for (const col of ["category", "brand", "description", "size"]) {
            expect(
                screen.getByLabelText(new RegExp(`filter by ${col}`, "i")),
            ).toBeInTheDocument();
        }
        fireEvent.change(screen.getByLabelText(/filter by category/i), {
            target: { value: "ski" },
        });
        fireEvent.change(screen.getByLabelText(/filter by brand/i), {
            target: { value: "ross" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
        await waitFor(() => expect(categoryParam).toBe("ski"));
        expect(brandParam).toBe("ross");
    });

    /** Verifies intake users do NOT see the column-filter inputs. */
    it("hides column filter inputs for non-admin (intake) users", async () => {
        server.use(
            http.get("/items/intake-search", () =>
                HttpResponse.json(pageOf([RESULT_A])),
            ),
        );
        renderPage("intake");
        await waitFor(() =>
            expect(screen.getByText("A001-01")).toBeInTheDocument(),
        );
        expect(screen.queryByLabelText(/filter by category/i)).toBeNull();
        expect(screen.queryByLabelText(/filter by brand/i)).toBeNull();
        expect(screen.queryByLabelText(/filter by description/i)).toBeNull();
        expect(screen.queryByLabelText(/filter by size/i)).toBeNull();
    });

    /** Verifies a typed column filter applies on blur (not only on Enter/Search). */
    it("re-runs the search on column-filter blur", async () => {
        let brandParam = "";
        server.use(
            http.get("/items/intake-search", ({ request }) => {
                brandParam = new URL(request.url).searchParams.get("brand") ?? "";
                return HttpResponse.json(pageOf([]));
            }),
        );
        renderPage("admin");
        await waitFor(() =>
            expect(screen.getByLabelText(/filter by brand/i)).toBeInTheDocument(),
        );
        fireEvent.change(screen.getByLabelText(/filter by brand/i), {
            target: { value: "atomic" },
        });
        fireEvent.blur(screen.getByLabelText(/filter by brand/i));
        await waitFor(() => expect(brandParam).toBe("atomic"));
        expect(screen.getByText(/no items match/i)).toBeInTheDocument();
    });

    /** Verifies the export honors typed column filters. */
    it("includes column filters in the Excel export URL", async () => {
        const { createObjectURL } = stubBlobDownload();
        let exportUrl = "";
        server.use(
            http.get("/items/intake-search/export", ({ request }) => {
                exportUrl = request.url;
                return new HttpResponse("excel-bytes", {
                    headers: {
                        "Content-Type":
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    },
                });
            }),
        );
        renderPage("admin");
        await waitFor(() =>
            expect(screen.getByLabelText(/filter by size/i)).toBeInTheDocument(),
        );
        fireEvent.change(screen.getByLabelText(/filter by size/i), {
            target: { value: "140" },
        });
        fireEvent.blur(screen.getByLabelText(/filter by size/i));
        // Blur triggers a re-search; the Download button disables while it runs.
        await waitFor(() =>
            expect(screen.getByText(/items? found/i)).toBeInTheDocument(),
        );
        fireEvent.click(
            screen.getByRole("button", { name: /download results/i }),
        );
        await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
        expect(exportUrl).toContain("size=140");
    });
});
