import { useState, useEffect } from "react";
import { getSellerPayout } from "../api/reports";
import type { SellerPayoutReport } from "../types";

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

const th = { textAlign: "left" as const, padding: "4px 8px", fontSize: 12 };
const td = { padding: "4px 8px", fontSize: 12 };
const tdNum = { padding: "4px 8px", textAlign: "right" as const, fontSize: 12 };

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
    const typeLabel = info.is_vendor
        ? `Vendor${info.company ? ` — ${info.company}` : ""}`
        : "Individual";
    const contact = contactString(payout);

    return (
        <div>
            {/* ── Seller information ─────────────────────────────────────── */}
            <table
                style={{
                    width: "auto",
                    borderCollapse: "collapse",
                    marginBottom: 16,
                }}
            >
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
                        <tr
                            key={label}
                            style={{ borderBottom: "1px solid #eee" }}
                        >
                            <td
                                style={{
                                    padding: "3px 16px 3px 8px",
                                    fontWeight: "bold",
                                    fontSize: 12,
                                }}
                            >
                                {label}
                            </td>
                            <td style={{ padding: "3px 8px", fontSize: 12 }}>
                                {val}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* ── Summary ─────────────────────────────────────────────────── */}
            <table
                style={{
                    width: "auto",
                    borderCollapse: "collapse",
                    marginBottom: 16,
                }}
            >
                <tbody>
                    {[
                        ["Items Consigned", String(payout.items_consigned)],
                        ["Items Sold", String(payout.items_sold)],
                        ["Gross Sales", `$${payout.gross_sales.toFixed(2)}`],
                        ["Due Seller", `$${payout.seller_total.toFixed(2)}`],
                    ].map(([label, val]) => (
                        <tr
                            key={label}
                            style={{ borderBottom: "1px solid #eee" }}
                        >
                            <td
                                style={{
                                    padding: "4px 16px 4px 8px",
                                    fontWeight: "bold",
                                    fontSize: 13,
                                }}
                            >
                                {label}
                            </td>
                            <td
                                style={{
                                    padding: "4px 8px",
                                    textAlign: "right",
                                    fontSize: 13,
                                }}
                            >
                                {val}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* ── ITEMS (single list, worksheet layout) ───────────────────── */}
            <h4 style={{ margin: "0 0 4px" }}>Items</h4>
            {payout.items.length > 0 ? (
                <table
                    style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        marginBottom: 16,
                    }}
                >
                    <thead>
                        <tr style={{ borderBottom: "2px solid #ccc" }}>
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
                                    style={{
                                        ...th,
                                        textAlign: [
                                            "Sell Price",
                                            "Quantity",
                                            "Remaining",
                                        ].includes(h)
                                            ? "right"
                                            : "left",
                                    }}
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
                                style={{
                                    borderBottom: "1px solid #eee",
                                    color: it.remaining === 0 ? "#64748b" : undefined,
                                }}
                            >
                                <td style={td}>{it.item_code}</td>
                                <td style={td}>{it.category ?? "—"}</td>
                                <td style={td}>{it.brand ?? "—"}</td>
                                <td style={td}>{it.description ?? "—"}</td>
                                <td style={td}>{it.size ?? "—"}</td>
                                <td style={tdNum}>
                                    ${it.price.toFixed(2)}
                                </td>
                                <td style={tdNum}>{it.quantity}</td>
                                <td style={tdNum}>{it.remaining}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>
                    No items consigned.
                </p>
            )}

            {/* ── SALES DETAIL ──────────────────────────────────────────────── */}
            <h4 style={{ margin: "0 0 4px" }}>Sales Detail</h4>
            {payout.sales.length > 0 ? (
                <table
                    style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        marginBottom: 16,
                    }}
                >
                    <thead>
                        <tr style={{ borderBottom: "2px solid #ccc" }}>
                            {(
                                [
                                    "Item Code",
                                    "Description",
                                    "Date Sold",
                                    "Qty",
                                    "Sell Price",
                                    "Extended",
                                    "Due Seller",
                                    "Rate",
                                ] as const
                            ).map((h) => (
                                <th
                                    key={h}
                                    style={{
                                        ...th,
                                        textAlign: [
                                            "Qty",
                                            "Sell Price",
                                            "Extended",
                                            "Due Seller",
                                            "Rate",
                                        ].includes(h)
                                            ? "right"
                                            : "left",
                                    }}
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
                                style={{ borderBottom: "1px solid #eee" }}
                            >
                                <td style={td}>
                                    {s.item_code}
                                    {s.price_adjustment_reason && (
                                        <div
                                            style={{
                                                fontSize: 11,
                                                color: "#64748b",
                                                marginTop: 2,
                                            }}
                                        >
                                            Price adj.: {s.price_adjustment_reason}
                                        </div>
                                    )}
                                </td>
                                <td style={td}>{s.description ?? "—"}</td>
                                <td style={td}>
                                    {s.date_of_sale
                                        ? new Date(
                                              s.date_of_sale,
                                          ).toLocaleDateString()
                                        : "—"}
                                </td>
                                <td style={tdNum}>{s.quantity_sold}</td>
                                <td style={tdNum}>
                                    ${s.sell_price.toFixed(2)}
                                </td>
                                <td style={tdNum}>
                                    ${s.extended_price.toFixed(2)}
                                </td>
                                <td style={tdNum}>
                                    ${s.seller_share.toFixed(2)}
                                </td>
                                <td style={tdNum}>
                                    {(s.commission_rate * 100).toFixed(0)}%
                                </td>
                            </tr>
                        ))}
                        <tr
                            style={{
                                fontWeight: "bold",
                                borderTop: "2px solid #ccc",
                            }}
                        >
                            <td style={td} colSpan={5}>
                                Sales Total
                            </td>
                            <td style={tdNum}>
                                ${payout.gross_sales.toFixed(2)}
                            </td>
                            <td style={tdNum}>
                                ${payout.seller_total.toFixed(2)}
                            </td>
                            <td style={td} />
                        </tr>
                    </tbody>
                </table>
            ) : (
                <p style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>
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
            <p style={{ color: "#64748b", fontSize: 13 }}>Loading payout…</p>
        );
    if (error)
        return (
            <p role="alert" style={{ color: "#ef4444", fontSize: 13 }}>
                {error}
            </p>
        );
    if (!payout) return null;

    return <SellerPayoutDetails payout={payout} />;
}
