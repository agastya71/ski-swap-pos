import { useState, useEffect } from "react";
import { getSellerPayout } from "../api/reports";
import type { SellerPayoutReport } from "../types";
import { useUiVariant } from "../lib/uiVariant";
import { variantProps, v1Only, v2Only, PAYOUT as V1_PAYOUT } from "./adminStyles";

/** Contact lines shown in the seller-info block (nulls skipped at render). */
function contactString(payout: SellerPayoutReport): string {
    const info = payout.seller_info;
    // Single pass (flatMap) — collects the non-null contact lines.
    return [
        info.phone,
        info.email,
        info.address,
        info.city,
        info.state,
        info.zip,
    ]
        .flatMap((v) => (v ? [String(v)] : []))
        .join(", ");
}

/**
 * Renders the detail sections of a payout report: seller contact information,
 * the single ITEMS list (every consigned item in the intake worksheet layout
 * with original/remaining quantities) and the SALES DETAIL section (every
 * non-voided sale line with prices and commission shares).
 * Exported so the all-sellers batch view can reuse it.
 */
export function SellerPayoutDetails({
    payout,
}: {
    payout: SellerPayoutReport;
}) {
    const info = payout.seller_info;
    const v2 = useUiVariant() === "v2";
    const typeLabel = info.is_vendor
        ? `Vendor${info.company ? ` — ${info.company}` : ""}`
        : "Individual";
    const contact = contactString(payout);

    return (
        <div>
            {/* ── Seller information ─────────────────────────────────────── */}
            <table {...variantProps(v2, "ui2-report-kv", V1_PAYOUT.kvTable)}>
                <tbody>
                    {[
                        [
                            "Seller",
                            `${payout.seller_name} (${payout.seller_code})`,
                        ],
                        [
                            "Type",
                            `${typeLabel} — commission ${(info.commission_rate * 100).toFixed(0)}%`,
                        ],
                        ["Phone", info.phone ?? "—"],
                        ["Email", info.email ?? "—"],
                        ["Address", contact],
                    ].map(([label, val]) => (
                        <tr key={label} {...v1Only(v2, V1_PAYOUT.bodyRow)}>
                            <td {...v1Only(v2, V1_PAYOUT.kvLabelSm)}>{label}</td>
                            <td {...v1Only(v2, V1_PAYOUT.kvValue)}>{val}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* ── Summary ─────────────────────────────────────────────────── */}
            <table {...variantProps(v2, "ui2-report-kv", V1_PAYOUT.kvTable)}>
                <tbody>
                    {[
                        ["Items Consigned", String(payout.items_consigned)],
                        ["Items Sold", String(payout.items_sold)],
                        ["Gross Sales", `$${payout.gross_sales.toFixed(2)}`],
                        ["Due Seller", `$${payout.seller_total.toFixed(2)}`],
                    ].map(([label, val]) => (
                        <tr key={label} {...v1Only(v2, V1_PAYOUT.bodyRow)}>
                            <td {...v1Only(v2, V1_PAYOUT.kvLabel13)}>{label}</td>
                            <td {...v1Only(v2, V1_PAYOUT.kvValueRight)}>{val}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* ── ITEMS (single list, worksheet layout) ───────────────────── */}
            <h4 {...variantProps(v2, "ui2-payout-section-title", V1_PAYOUT.sectionTitle)}>
                Items
            </h4>
            {payout.items.length > 0 ? (
                <div {...v2Only(v2, "ui2-scroll-x")}>
                <table {...variantProps(v2, "ui2-report-table", V1_PAYOUT.dataTable)}>
                    <thead>
                        <tr {...v1Only(v2, V1_PAYOUT.headRow)}>
                            {(
                                [
                                    "Item Code",
                                    "Category",
                                    "Brand",
                                    "Description",
                                    "Size",
                                    "Sell Price",
                                    "Quantity",
                                    "Remaining",
                                ] as const
                            ).map((h) => (
                                <th
                                    key={h}
                                    {...v1Only(v2, V1_PAYOUT.thCompact)}
                                    className={
                                        V1_PAYOUT.itemsNumericColumns.includes(h)
                                            ? "ui2-num"
                                            : undefined
                                    }
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {payout.items.map((it, i) => (
                            <tr
                                key={`${it.item_code}-${i}`}
                                {...variantProps(
                                    v2,
                                    it.remaining === 0
                                        ? "ui2-row--soldout"
                                        : "",
                                    it.remaining === 0
                                        ? V1_PAYOUT.bodyRowSoldOut
                                        : V1_PAYOUT.bodyRow,
                                )}
                            >
                                <td {...v1Only(v2, V1_PAYOUT.cellCompact)}>{it.item_code}</td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompact)}>{it.category ?? "—"}</td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompact)}>{it.brand ?? "—"}</td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompact)}>{it.description ?? "—"}</td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompact)}>{it.size ?? "—"}</td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompactRight)}>
                                    ${it.price.toFixed(2)}
                                </td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompactRight)}>{it.quantity}</td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompactRight)}>{it.remaining}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                </div>
            ) : (
                <p {...variantProps(v2, "ui2-payout-empty", V1_PAYOUT.emptyLine)}>
                    No items consigned.
                </p>
            )}

            {/* ── SALES DETAIL ──────────────────────────────────────────────── */}
            <h4 {...variantProps(v2, "ui2-payout-section-title", V1_PAYOUT.sectionTitle)}>
                Sales Detail
            </h4>
            {payout.sales.length > 0 ? (
                <div {...v2Only(v2, "ui2-scroll-x")}>
                <table {...variantProps(v2, "ui2-report-table", V1_PAYOUT.dataTable)}>
                    <thead>
                        <tr {...v1Only(v2, V1_PAYOUT.headRow)}>
                            {(
                                [
                                    "Item Code",
                                    "Category",
                                    "Type",
                                    "Brand",
                                    "Description",
                                    "Qty",
                                    "Sell Price",
                                    "Extended",
                                    "Due Seller",
                                    "Rate",
                                ] as const
                            ).map((h) => (
                                <th
                                    key={h}
                                    {...v1Only(v2, V1_PAYOUT.thCompact)}
                                    className={
                                        V1_PAYOUT.salesNumericColumns.includes(h)
                                            ? "ui2-num"
                                            : undefined
                                    }
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {payout.sales.map((s, i) => (
                            <tr
                                key={`${s.item_code}-${i}`}
                                {...v1Only(v2, V1_PAYOUT.bodyRow)}
                            >
                                <td {...v1Only(v2, V1_PAYOUT.cellCompact)}>
                                    {s.item_code}
                                    {s.price_adjustment_reason && (
                                        <div
                                            {...variantProps(
                                                v2,
                                                "ui2-payout-price-adj",
                                                V1_PAYOUT.priceAdj,
                                            )}
                                        >
                                            Price adj.: {s.price_adjustment_reason}
                                        </div>
                                    )}
                                </td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompact)}>{s.category ?? "—"}</td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompact)}>{s.type ?? "—"}</td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompact)}>{s.brand ?? "—"}</td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompact)}>{s.description ?? "—"}</td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompactRight)}>{s.quantity_sold}</td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompactRight)}>
                                    ${s.sell_price.toFixed(2)}
                                </td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompactRight)}>
                                    ${s.extended_price.toFixed(2)}
                                </td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompactRight)}>
                                    ${s.seller_share.toFixed(2)}
                                </td>
                                <td {...v1Only(v2, V1_PAYOUT.cellCompactRight)}>
                                    {(s.commission_rate * 100).toFixed(0)}%
                                </td>
                            </tr>
                        ))}
                        <tr {...variantProps(v2, "ui2-row--total", V1_PAYOUT.totalsRow)}>
                            <td {...v1Only(v2, V1_PAYOUT.cellCompact)} colSpan={7}>
                                Sales Total
                            </td>
                            <td {...v1Only(v2, V1_PAYOUT.cellCompactRight)}>
                                ${payout.gross_sales.toFixed(2)}
                            </td>
                            <td {...v1Only(v2, V1_PAYOUT.cellCompactRight)}>
                                ${payout.seller_total.toFixed(2)}
                            </td>
                            <td {...v1Only(v2, V1_PAYOUT.cellCompact)} />
                        </tr>
                    </tbody>
                </table>
                </div>
            ) : (
                <p {...variantProps(v2, "ui2-payout-empty", V1_PAYOUT.emptyLine)}>
                    No sales in this event.
                </p>
            )}
        </div>
    );
}

/**
 * Fetches and displays the payout report for a single seller.
 * Manages its own loading and error state.
 *
 * @param props.eventId - ID of the event to report on.
 * @param props.sellerId - ID of the seller whose payout to display.
 */
export function SellerPayoutPanel({
    eventId,
    sellerId,
}: {
    eventId: number;
    sellerId: number;
}) {
    const [payout, setPayout] = useState<SellerPayoutReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const v2 = useUiVariant() === "v2";

    useEffect(() => {
        getSellerPayout(eventId, sellerId)
            .then(setPayout)
            .catch((err) =>
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to load payout",
                ),
            )
            .finally(() => setLoading(false));
    }, [eventId, sellerId]);

    if (loading)
        return (
            <p {...variantProps(v2, "ui2-payout-loading", V1_PAYOUT.loading)}>
                Loading payout…
            </p>
        );
    if (error)
        return (
            <p role="alert" {...variantProps(v2, "ui2-payout-error", V1_PAYOUT.error)}>
                {error}
            </p>
        );
    if (!payout) return null;

    return <SellerPayoutDetails payout={payout} />;
}
