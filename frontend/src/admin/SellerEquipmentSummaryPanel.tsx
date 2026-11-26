import { useState } from "react";
import { getVendorEquipmentSummary } from "../api/reports";
import type { VendorEquipmentSummaryReport } from "../types";
import { useUiVariant } from "../lib/uiVariant";
import { variantProps, v1Only, v2Only, EQUIPMENT as V1_EQ } from "./adminStyles";

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
    const v2 = useUiVariant() === "v2";

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

    return (
        <div>
            {!summary && (
                <button
                    onClick={load}
                    disabled={loading}
                    aria-label="show equipment summary"
                    style={v2 ? undefined : V1_EQ.button}
                >
                    {loading ? "Loading…" : "Show Equipment Summary"}
                </button>
            )}
            {error && (
                <p role="alert" {...variantProps(v2, "ui2-equipment-error", V1_EQ.error)}>
                    {error}
                </p>
            )}
            {summary && (
                /* Wrapper (not `TableScroll`): the equipment table keeps its own
                   auto width, so the v2 rule here scrolls without forcing 100%. */
                <div {...v2Only(v2, "ui2-equipment-scroll")}>
                    <table
                        {...variantProps(v2, "ui2-equipment-table", V1_EQ.table)}
                    >
                        <thead>
                            <tr {...v1Only(v2, V1_EQ.headRow)}>
                                {[
                                    ["Category", false],
                                    ["Consigned", true],
                                    ["Units Sold", true],
                                    ["Gross", true],
                                    ["MYSL", true],
                                    ["Vendor Payout", true],
                                    ["Unsold Units", true],
                                    ["Unsold $", true],
                                ].map(([label, numeric]) => (
                                    <th
                                        key={label as string}
                                        {...v1Only(v2, V1_EQ.th)}
                                        className={numeric ? "ui2-num" : undefined}
                                    >
                                        {label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {summary.categories.map((c) => (
                                <tr key={c.category} {...v1Only(v2, V1_EQ.bodyRow)}>
                                    <td {...v1Only(v2, V1_EQ.cellCompact)}>{c.category}</td>
                                    <td {...v1Only(v2, V1_EQ.cellCompactRight)}>{c.items_consigned}</td>
                                    <td {...v1Only(v2, V1_EQ.cellCompactRight)}>{c.units_sold}</td>
                                    <td {...v1Only(v2, V1_EQ.cellCompactRight)}>${c.gross_sales.toFixed(2)}</td>
                                    <td {...v1Only(v2, V1_EQ.cellCompactRight)}>${c.mysl_share.toFixed(2)}</td>
                                    <td {...v1Only(v2, V1_EQ.cellCompactRight)}>${c.seller_share.toFixed(2)}</td>
                                    <td {...v1Only(v2, V1_EQ.cellCompactRight)}>{c.units_unsold}</td>
                                    <td {...v1Only(v2, V1_EQ.cellCompactRight)}>${c.unsold_value.toFixed(2)}</td>
                                </tr>
                            ))}
                            <tr {...variantProps(v2, "ui2-row--total", V1_EQ.totalsRow)}>
                                <td {...v1Only(v2, V1_EQ.cellCompact)}>{summary.total.category}</td>
                                <td {...v1Only(v2, V1_EQ.cellCompactRight)}>{summary.total.items_consigned}</td>
                                <td {...v1Only(v2, V1_EQ.cellCompactRight)}>{summary.total.units_sold}</td>
                                <td {...v1Only(v2, V1_EQ.cellCompactRight)}>${summary.total.gross_sales.toFixed(2)}</td>
                                <td {...v1Only(v2, V1_EQ.cellCompactRight)}>${summary.total.mysl_share.toFixed(2)}</td>
                                <td {...v1Only(v2, V1_EQ.cellCompactRight)}>${summary.total.seller_share.toFixed(2)}</td>
                                <td {...v1Only(v2, V1_EQ.cellCompactRight)}>{summary.total.units_unsold}</td>
                                <td {...v1Only(v2, V1_EQ.cellCompactRight)}>${summary.total.unsold_value.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
