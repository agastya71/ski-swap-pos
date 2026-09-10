/**
 * All-sellers payouts panel — fetches payout reports for every seller in the
 * event and renders grand totals plus one payout card per seller (seller
 * contact information, SALES section, UNSOLD ITEMS section).
 *
 * @module AllSellersPayouts
 */
import { useState, useEffect } from "react";
import { downloadFile, getAllSellerPayouts } from "../api/reports";
import { SellerPayoutDetails } from "./SellerPayoutPanel";
import type { SellersPayoutsReport } from "../types";

/**
 * Fetches and displays the payout reports for ALL sellers in an event.
 * Manages its own loading and error state; each seller renders as a card
 * with their contact info, SALES and UNSOLD ITEMS sections.
 *
 * @param props.eventId - ID of the event to report on.
 */
export function AllSellersPayouts({ eventId }: { eventId: number }) {
    const [report, setReport] = useState<SellersPayoutsReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getAllSellerPayouts(eventId)
            .then(setReport)
            .catch((err) =>
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to load payouts",
                ),
            )
            .finally(() => setLoading(false));
    }, [eventId]);

    if (loading)
        return (
            <p style={{ color: "#64748b", fontSize: 13 }}>
                Generating all sellers' payouts…
            </p>
        );
    if (error)
        return (
            <p role="alert" style={{ color: "#ef4444", fontSize: 13 }}>
                {error}
            </p>
        );
    if (!report) return null;

    return (
        <div>
            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginBottom: 8,
                }}
            >
                <button
                    aria-label="Download zip of all seller payouts"
                    onClick={() =>
                        void downloadFile(
                            `/reports/${eventId}/sellers-payouts/export-zip`,
                            "sellers-payouts.zip",
                        )
                    }
                    style={{
                        border: "1px solid #1a237e",
                        color: "#1a237e",
                        background: "none",
                        padding: "3px 10px",
                        cursor: "pointer",
                        borderRadius: 3,
                        fontSize: 13,
                    }}
                >
                    Download ZIP (Excel + PDF per seller)
                </button>
            </div>
            <table style={{ borderCollapse: "collapse", marginBottom: 16 }}>
                <tbody>
                    {[
                        ["Sellers", String(report.seller_count)],
                        [
                            "Gross Sales (all)",
                            `$${report.gross_sales_total.toFixed(2)}`,
                        ],
                        [
                            "Due Seller (all)",
                            `$${report.seller_total.toFixed(2)}`,
                        ],
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

            {report.sellers.map((p) => (
                <section
                    key={p.seller_id}
                    style={{
                        marginBottom: 24,
                        border: "1px solid #e2e8f0",
                        borderRadius: 6,
                        padding: 12,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8,
                        }}
                    >
                        <h4 style={{ margin: 0 }}>
                            {p.seller_name} ({p.seller_code})
                            <span
                                style={{
                                    fontWeight: "normal",
                                    fontSize: 13,
                                    marginLeft: 8,
                                }}
                            >
                                Sold: {p.items_sold} · Unsold: {p.items_unsold}{" "}
                                · Payout: ${p.seller_total.toFixed(2)}
                            </span>
                        </h4>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button
                                aria-label={`Download xlsx payout for ${p.seller_code}`}
                                onClick={() =>
                                    void downloadFile(
                                        `/reports/${eventId}/seller/${p.seller_id}?format=xlsx`,
                                        `${p.seller_code}_payout.xlsx`,
                                    )
                                }
                                style={{
                                    border: "1px solid #1a237e",
                                    color: "#1a237e",
                                    background: "none",
                                    padding: "3px 10px",
                                    cursor: "pointer",
                                    borderRadius: 3,
                                    fontSize: 13,
                                }}
                            >
                                Download XLSX
                            </button>
                            <button
                                aria-label={`Download pdf payout for ${p.seller_code}`}
                                onClick={() =>
                                    void downloadFile(
                                        `/reports/${eventId}/seller/${p.seller_id}?format=pdf`,
                                        `${p.seller_code}_payout.pdf`,
                                    )
                                }
                                style={{
                                    border: "1px solid #1a237e",
                                    color: "#1a237e",
                                    background: "none",
                                    padding: "3px 10px",
                                    cursor: "pointer",
                                    borderRadius: 3,
                                    fontSize: 13,
                                }}
                            >
                                Download PDF
                            </button>
                        </div>
                    </div>
                    <SellerPayoutDetails payout={p} />
                </section>
            ))}
        </div>
    );
}
