/**
 * Intake item search page — searches ALL intake items for the active event
 * across every field (code, description, category, brand, type, color, size,
 * gender/age, year, price, quantity, remaining, status, and the seller's
 * code/name/company). Admins additionally get per-column substring filters
 * (Category, Brand, Description, Size) rendered as inputs under the column
 * headers; results can be downloaded as an Excel export matching the current
 * search filters.
 *
 * @module ItemSearchPage
 */
import { useEffect, useState, type FormEvent } from "react";
import {
    searchIntakeItems,
    exportIntakeSearch,
    type ItemSearchColumnFilters,
} from "../api/items";
import type { ItemSearchResult } from "../types";
import { useAuth } from "../auth/AuthContext";
import { SEARCH_PAGE, variantProps, v1Only, v2Only } from "./intakeStyles";
import { useUiVariant } from "../lib/uiVariant";
import { TableScroll } from "../components/ui/primitives";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "", label: "All statuses" },
    { value: "available", label: "Available" },
    { value: "sold", label: "Sold" },
    { value: "donated", label: "Donated" },
    { value: "returned", label: "Returned" },
];

/** Filter-row cells in header order: null = no filter for that column. */
const FILTER_ROW: Array<{ filterKey: keyof ItemSearchColumnFilters } | null> = [
    null, // Code
    null, // Qty
    { filterKey: "category" },
    null, // Type
    { filterKey: "brand" },
    { filterKey: "description" },
    { filterKey: "size" },
    null, // Sell Price
    null, // Donate?
    null, // Remaining
    null, // Status
    null, // Seller
];

/** Accessible labels for the per-column filter inputs. */
const FILTER_LABELS: Record<string, string> = {
    category: "Filter by category",
    brand: "Filter by brand",
    description: "Filter by description",
    size: "Filter by size",
};

/** Shape of the per-column filter row state ("" = no filter for that column). */
type ColumnFilterState = Record<string, string>;

/**
 * Search panel + results table for intake items, with an Excel export button
 * that downloads the results matching the current search filters. Admin users
 * also see per-column substring filter inputs under the Category, Brand,
 * Description, and Size headers.
 */
export function ItemSearchPage() {
    const { decoded } = useAuth();
    const v2 = useUiVariant() === "v2";
    const isAdmin = decoded?.role === "admin";
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("");
    const [columnFilters, setColumnFilters] = useState<ColumnFilterState>({});
    const [results, setResults] = useState<ItemSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

    /** Runs the search with the given filters and updates the result table. */
    async function runSearch(
        query: string,
        statusFilter: string,
        filters: ColumnFilterState = columnFilters,
    ) {
        setLoading(true);
        setError(null);
        try {
            const data = await searchIntakeItems(query, statusFilter, filters);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    /** Applies a column-filter edit (debounced via onBlur + Enter/submit). */
    function handleColumnFilterChange(key: string, value: string) {
        setColumnFilters((prev) => ({ ...prev, [key]: value }));
    }

    /** Applies the current column filters immediately (Enter or blur). */
    function handleColumnFilterApply() {
        void runSearch(q, status, columnFilters);
    }

    /** Downloads an Excel export of the current search results. */
    async function handleExport() {
        setError(null);
        setExporting(true);
        try {
            await exportIntakeSearch(q, status, columnFilters);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Export failed");
        } finally {
            setExporting(false);
        }
    }

    return (
        <div>
            <h3>Search Intake Items</h3>
            <p {...variantProps(v2, "ui2-search-intro", SEARCH_PAGE.intro)}>
                Searches every field: code, description, category, brand, type,
                color, size, gender/age, year, price, quantity, status, and
                seller name/code.
            </p>
            <form
                onSubmit={handleSubmit}
                {...variantProps(v2, "ui2-search-form", SEARCH_PAGE.form)}
            >
                <div>
                    <label
                        htmlFor="itemSearch"
                        {...variantProps(v2, "ui2-search-label", SEARCH_PAGE.label)}
                    >
                        Search all fields
                    </label>
                    <input
                        id="itemSearch"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="e.g. skis, Rossignol, A001, red, 2018, 45"
                        {...variantProps(v2, "ui2-search-query", SEARCH_PAGE.queryInput)}
                    />
                </div>
                <div>
                    <label
                        htmlFor="itemSearchStatus"
                        {...variantProps(v2, "ui2-search-label", SEARCH_PAGE.label)}
                    >
                        Status
                    </label>
                    <select
                        id="itemSearchStatus"
                        value={status}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        {...variantProps(v2, "ui2-search-status", SEARCH_PAGE.statusSelect)}
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
                    style={v1Only(v2, SEARCH_PAGE.formButton).style}
                    {...v2Only(v2, "ui2-btn ui2-btn--primary")}
                >
                    Search
                </button>
                <button
                    type="button"
                    onClick={() => void handleExport()}
                    disabled={exporting || loading}
                    style={v1Only(v2, SEARCH_PAGE.formButton).style}
                    {...v2Only(v2, "ui2-btn ui2-btn--primary")}
                >
                    {exporting ? "Exporting…" : "Download results (xlsx)"}
                </button>
            </form>

            {loading && (
                <div {...variantProps(v2, "ui2-search-searching", SEARCH_PAGE.searching)}>
                    Searching…
                </div>
            )}
            {error && (
                <div role="alert" {...variantProps(v2, "ui2-search-error", SEARCH_PAGE.errorLine)}>
                    {error}
                </div>
            )}
            {searched && !loading && (
                <div {...variantProps(v2, "ui2-search-count", SEARCH_PAGE.foundCount)}>
                    {results.length} item{results.length === 1 ? "" : "s"} found
                </div>
            )}

            <TableScroll>
            <table {...variantProps(v2, "ui2-search-table", SEARCH_PAGE.table)}>
                <thead>
                    <tr {...v1Only(v2, SEARCH_PAGE.headRow)}>
                        <th {...v1Only(v2, SEARCH_PAGE.cell)}>Code</th>
                        <th {...v1Only(v2, SEARCH_PAGE.cell)}>Qty</th>
                        <th {...v1Only(v2, SEARCH_PAGE.cell)}>Category</th>
                        <th {...v1Only(v2, SEARCH_PAGE.cell)}>Type</th>
                        <th {...v1Only(v2, SEARCH_PAGE.cell)}>Brand</th>
                        <th {...v1Only(v2, SEARCH_PAGE.cell)}>Description</th>
                        <th {...v1Only(v2, SEARCH_PAGE.cell)}>Size</th>
                        <th {...v1Only(v2, SEARCH_PAGE.cell)}>Sell Price</th>
                        <th {...v1Only(v2, SEARCH_PAGE.cell)}>Donate?</th>
                        <th {...v1Only(v2, SEARCH_PAGE.cell)}>Remaining</th>
                        <th {...v1Only(v2, SEARCH_PAGE.cell)}>Status</th>
                        <th {...v1Only(v2, SEARCH_PAGE.cell)}>Seller</th>
                    </tr>
                    {isAdmin && (
                        <tr>
                            {FILTER_ROW.map((entry, i) =>
                                entry === null ? (
                                    <td key={`col-${i}`} {...v1Only(v2, SEARCH_PAGE.cell)} />
                                ) : (
                                    <td
                                        key={entry.filterKey}
                                        {...v1Only(v2, SEARCH_PAGE.filterCell)}
                                    >
                                        <ColumnFilterInput
                                            v2={v2}
                                            filterKey={entry.filterKey}
                                            label={FILTER_LABELS[entry.filterKey]}
                                            value={
                                                columnFilters[entry.filterKey] ?? ""
                                            }
                                            onChange={handleColumnFilterChange}
                                            onApply={handleColumnFilterApply}
                                        />
                                    </td>
                                ),
                            )}
                        </tr>
                    )}
                </thead>
                <tbody>
                    {results.map((item) => (
                        <tr
                            key={item.id}
                            {...v1Only(v2, SEARCH_PAGE.bodyRow)}
                        >
                            <td {...v1Only(v2, SEARCH_PAGE.cell)}>{item.code}</td>
                            <td {...v1Only(v2, SEARCH_PAGE.cell)}>{item.quantity}</td>
                            <td {...v1Only(v2, SEARCH_PAGE.cell)}>{item.category}</td>
                            <td {...v1Only(v2, SEARCH_PAGE.cell)}>{item.type ?? "—"}</td>
                            <td {...v1Only(v2, SEARCH_PAGE.cell)}>{item.brand ?? "—"}</td>
                            <td {...v1Only(v2, SEARCH_PAGE.cell)}>{item.description}</td>
                            <td {...v1Only(v2, SEARCH_PAGE.cell)}>{item.size}</td>
                            <td {...v1Only(v2, SEARCH_PAGE.cell)}>
                                ${(item.price ?? 0).toFixed(2)}
                            </td>
                            <td {...v1Only(v2, SEARCH_PAGE.cell)}>
                                {item.donate_unsold ? "Yes" : "—"}
                            </td>
                            <td {...v1Only(v2, SEARCH_PAGE.cell)}>{item.remaining}</td>
                            <td {...v1Only(v2, SEARCH_PAGE.cell)}>{item.status}</td>
                            <td {...v1Only(v2, SEARCH_PAGE.cell)}>
                                {item.seller_code}
                                {item.seller_name
                                    ? ` — ${item.seller_name}`
                                    : ""}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            </TableScroll>
            {searched && !loading && results.length === 0 && !error && (
                <div {...variantProps(v2, "ui2-search-empty", SEARCH_PAGE.noResults)}>
                    No items match your search.
                </div>
            )}
        </div>
    );
}

/** One per-column filter input, applied on Enter or blur. */
function ColumnFilterInput({
    filterKey,
    label,
    value,
    onChange,
    onApply,
    v2,
}: {
    filterKey: string;
    label: string;
    value: string;
    onChange: (key: string, value: string) => void;
    onApply: () => void;
    v2: boolean;
}) {
    return (
        <input
            aria-label={label}
            value={value}
            onChange={(e) => onChange(filterKey, e.target.value)}
            onBlur={onApply}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    onApply();
                }
            }}
            placeholder="Filter"
            {...variantProps(v2, "ui2-search-filter", SEARCH_PAGE.filterInput)}
        />
    );
}
