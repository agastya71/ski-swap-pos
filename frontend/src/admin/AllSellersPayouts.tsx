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
import { useUiVariant } from "../lib/uiVariant";
import { variantProps, v1Only, ALL_SELLERS as V1_ALL } from "./adminStyles";

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
    const v2 = useUiVariant() === "v2";

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
            <p {...variantProps(v2, "ui2-payout-loading", V1_ALL.loading)}>
                Generating all sellers' payouts…
            </p>
        );
    if (error)
        return (
            <p role="alert" {...variantProps(v2, "ui2-payout-error", V1_ALL.error)}>
                {error}
            </p>
        );
    if (!report) return null;

    return (
        <div>
            <div {...variantProps(v2, "ui2-allzip-row", V1_ALL.zipRow)}>
                <button
                    aria-label="Download zip of all seller payouts"
                    onClick={() =>
                        void downloadFile(
                            `/reports/${eventId}/sellers-payouts/export-zip`,
                            "sellers-payouts.zip",
                        )
                    }
                    {...variantProps(v2, "ui2-outline-btn", V1_ALL.outlineButton)}
                >
                    Download ZIP (Excel + PDF per seller)
                </button>
            </div>
            <table {...variantProps(v2, "ui2-report-kv", V1_ALL.kvTable)}>
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
                        <tr key={label} {...v1Only(v2, V1_ALL.bodyRow)}>
                            <td {...v1Only(v2, V1_ALL.kvLabel13)}>{label}</td>
                            <td {...v1Only(v2, V1_ALL.kvValueRight)}>{val}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {report.sellers.map((p) => (
                <section
                    key={p.seller_id}
                    {...variantProps(v2, "ui2-seller-card", V1_ALL.sellerCard)}
                >
                    <div {...variantProps(v2, "ui2-seller-card-head", V1_ALL.sellerHead)}>
                        <h4 {...variantProps(v2, "ui2-seller-card-title", V1_ALL.sellerTitle)}>
                            {p.seller_name} ({p.seller_code})
                            <span {...variantProps(v2, "ui2-seller-card-meta", V1_ALL.sellerMeta)}>
                                Sold: {p.items_sold} · Unsold: {p.items_unsold}{" "}
                                · Payout: ${p.seller_total.toFixed(2)}
                            </span>
                        </h4>
                        <div {...variantProps(v2, "ui2-seller-card-actions", V1_ALL.actionRow)}>
                            <button
                                aria-label={`Download xlsx payout for ${p.seller_code}`}
                                onClick={() =>
                                    void downloadFile(
                                        `/reports/${eventId}/seller/${p.seller_id}?format=xlsx`,
                                        `${p.seller_code}_payout.xlsx`,
                                    )
                                }
                                {...variantProps(v2, "ui2-outline-btn", V1_ALL.outlineButton)}
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
                                {...variantProps(v2, "ui2-outline-btn", V1_ALL.outlineButton)}
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
