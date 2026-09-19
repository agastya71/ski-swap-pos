/**
 * Intake item search page — searches ALL intake items for the active event
 * across every field (code, description, category, brand, type, color, size,
 * gender/age, year, price, quantity, remaining, status, and the seller's
 * code/name/company). Results can be downloaded as an Excel export matching
 * the current search filters.
 *
 * @module ItemSearchPage
 */
import { useEffect, useState, type FormEvent } from "react";
import { searchIntakeItems, exportIntakeSearch } from "../api/items";
import type { ItemSearchResult } from "../types";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "", label: "All statuses" },
    { value: "available", label: "Available" },
    { value: "sold", label: "Sold" },
    { value: "donated", label: "Donated" },
    { value: "returned", label: "Returned" },
];

/**
 * Search panel + results table for intake items, with an Excel export button
 * that downloads the results matching the current search filters.
 */
export function ItemSearchPage() {
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("");
    const [results, setResults] = useState<ItemSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

    /** Runs the search with the given filters and updates the result table. */
    async function runSearch(query: string, statusFilter: string) {
        setLoading(true);
        setError(null);
        try {
            const data = await searchIntakeItems(query, statusFilter);
            setResults(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Search failed");
            setResults([]);
        } finally {
            setLoading(false);
            setSearched(true);
        }
    }

    // Load the full item list (server-bounded) once so the tab is useful immediately.
    useEffect(() => {
        void runSearch("", "");
    }, []);

    /** Submits the search form (button click or Enter in the search field). */
    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        void runSearch(q, status);
    }

    /** Re-runs the search when the status filter changes. */
    function handleStatusChange(value: string) {
        setStatus(value);
        void runSearch(q, value);
    }

    /** Downloads an Excel export of the current search results. */
    async function handleExport() {
        setError(null);
        setExporting(true);
        try {
            await exportIntakeSearch(q, status);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Export failed");
        } finally {
            setExporting(false);
        }
    }

    const cell = { padding: "6px 8px", textAlign: "left" as const };

    return (
        <div>
            <h3>Search Intake Items</h3>
            <p style={{ fontSize: 13, color: "#555", marginTop: 0 }}>
                Searches every field: code, description, category, brand, type,
                color, size, gender/age, year, price, quantity, status, and
                seller name/code.
            </p>
            <form
                onSubmit={handleSubmit}
                style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "end",
                    marginBottom: 16,
                }}
            >
                <div>
                    <label
                        htmlFor="itemSearch"
                        style={{
                            display: "block",
                            fontSize: 13,
                            marginBottom: 3,
                        }}
                    >
                        Search all fields
                    </label>
                    <input
                        id="itemSearch"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="e.g. skis, Rossignol, A001, red, 2018, 45"
                        style={{ width: 320, padding: 8 }}
                    />
                </div>
                <div>
                    <label
                        htmlFor="itemSearchStatus"
                        style={{
                            display: "block",
                            fontSize: 13,
                            marginBottom: 3,
                        }}
                    >
                        Status
                    </label>
                    <select
                        id="itemSearchStatus"
                        value={status}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        style={{ padding: 8 }}
                    >
                        {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    type="submit"
                    disabled={loading}
                    style={{ padding: "8px 20px" }}
                >
                    Search
                </button>
                <button
                    type="button"
                    onClick={() => void handleExport()}
                    disabled={exporting || loading}
                    style={{ padding: "8px 20px" }}
                >
                    {exporting ? "Exporting…" : "Download results (xlsx)"}
                </button>
            </form>

            {loading && (
                <div style={{ color: "#555", marginBottom: 8 }}>Searching…</div>
            )}
            {error && (
                <div role="alert" style={{ color: "red", marginBottom: 8 }}>
                    {error}
                </div>
            )}
            {searched && !loading && (
                <div style={{ marginBottom: 8, fontSize: 14 }}>
                    {results.length} item{results.length === 1 ? "" : "s"} found
                </div>
            )}

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                    <tr style={{ borderBottom: "2px solid #ccc" }}>
                        <th style={cell}>Code</th>
                        <th style={cell}>Qty</th>
                        <th style={cell}>Category</th>
                        <th style={cell}>Type</th>
                        <th style={cell}>Brand</th>
                        <th style={cell}>Description</th>
                        <th style={cell}>Size</th>
                        <th style={cell}>Sell Price</th>
                        <th style={cell}>Donate?</th>
                        <th style={cell}>Remaining</th>
                        <th style={cell}>Status</th>
                        <th style={cell}>Seller</th>
                    </tr>
                </thead>
                <tbody>
                    {results.map((item) => (
                        <tr
                            key={item.id}
                            style={{ borderBottom: "1px solid #eee" }}
                        >
                            <td style={cell}>{item.code}</td>
                            <td style={cell}>{item.quantity}</td>
                            <td style={cell}>{item.category}</td>
                            <td style={cell}>{item.type ?? "—"}</td>
                            <td style={cell}>{item.brand ?? "—"}</td>
                            <td style={cell}>{item.description}</td>
                            <td style={cell}>{item.size}</td>
                            <td style={cell}>
                                ${(item.price ?? 0).toFixed(2)}
                            </td>
                            <td style={cell}>
                                {item.donate_unsold ? "Yes" : "—"}
                            </td>
                            <td style={cell}>{item.remaining}</td>
                            <td style={cell}>{item.status}</td>
                            <td style={cell}>
                                {item.seller_code}
                                {item.seller_name
                                    ? ` — ${item.seller_name}`
                                    : ""}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {searched && !loading && results.length === 0 && !error && (
                <div style={{ color: "#555", marginTop: 12 }}>
                    No items match your search.
                </div>
            )}
        </div>
    );
}
