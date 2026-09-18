import { useState } from "react";
import { getVendorEquipmentSummary } from "../api/reports";
import type { VendorEquipmentSummaryReport } from "../types";
import { BUTTON_STYLE } from "../lib/buttons";

/**
 * Admin panel: on-demand vendor summary grouped by equipment type
 * (item.category) — e.g. "how many skate skis did this vendor sell".
 * Shown only for vendor sellers on the seller detail page; the fetch is
 * explicit (button click) so no report is generated until an admin asks.
 */
export function SellerEquipmentSummaryPanel({
    eventId,
    sellerId,
}: {
    eventId: number;
    sellerId: number;
}) {
    const [summary, setSummary] = useState<VendorEquipmentSummaryReport | null>(
        null,
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            setSummary(await getVendorEquipmentSummary(eventId, sellerId));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    };

    const th = { textAlign: "left" as const, padding: "4px 8px", fontSize: 12 };
    const tdNum = {
        padding: "4px 8px",
        textAlign: "right" as const,
        fontSize: 12,
    };

    return (
        <div>
            {!summary && (
                <button
                    onClick={load}
                    disabled={loading}
                    aria-label="show equipment summary"
                    style={BUTTON_STYLE}
                >
                    {loading ? "Loading…" : "Show Equipment Summary"}
                </button>
            )}
            {error && (
                <p role="alert" style={{ color: "red", marginTop: 8 }}>
                    {error}
                </p>
            )}
            {summary && (
                <table
                    style={{
                        width: "auto",
                        borderCollapse: "collapse",
                        marginTop: 8,
                    }}
                >
                    <thead>
                        <tr style={{ borderBottom: "1px solid #ccc" }}>
                            <th style={th}>Category</th>
                            <th style={th}>Consigned</th>
                            <th style={th}>Units Sold</th>
                            <th style={th}>Gross</th>
                            <th style={th}>MYSL</th>
                            <th style={th}>Vendor Payout</th>
                            <th style={th}>Unsold Units</th>
                            <th style={th}>Unsold $</th>
                        </tr>
                    </thead>
                    <tbody>
                        {summary.categories.map((c) => (
                            <tr
                                key={c.category}
                                style={{ borderBottom: "1px solid #eee" }}
                            >
                                <td style={{ padding: "4px 8px", fontSize: 12 }}>
                                    {c.category}
                                </td>
                                <td style={tdNum}>{c.items_consigned}</td>
                                <td style={tdNum}>{c.units_sold}</td>
                                <td style={tdNum}>${c.gross_sales.toFixed(2)}</td>
                                <td style={tdNum}>${c.mysl_share.toFixed(2)}</td>
                                <td style={tdNum}>${c.seller_share.toFixed(2)}</td>
                                <td style={tdNum}>{c.units_unsold}</td>
                                <td style={tdNum}>${c.unsold_value.toFixed(2)}</td>
                            </tr>
                        ))}
                        <tr style={{ fontWeight: 700, borderTop: "1px solid #ccc" }}>
                            <td style={{ padding: "4px 8px", fontSize: 12 }}>
                                {summary.total.category}
                            </td>
                            <td style={tdNum}>{summary.total.items_consigned}</td>
                            <td style={tdNum}>{summary.total.units_sold}</td>
                            <td style={tdNum}>${summary.total.gross_sales.toFixed(2)}</td>
                            <td style={tdNum}>${summary.total.mysl_share.toFixed(2)}</td>
                            <td style={tdNum}>${summary.total.seller_share.toFixed(2)}</td>
                            <td style={tdNum}>{summary.total.units_unsold}</td>
                            <td style={tdNum}>${summary.total.unsold_value.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            )}
        </div>
    );
}