/**
 * End-of-day report page — displays a session summary (sales counts, revenue
 * breakdown, payment totals) and provides PDF/CSV/Markdown download buttons
 * as well as a database backup download for the active event.
 */

import { useState, useEffect } from "react";
import { getEndOfDay, downloadFile } from "../api/reports";
import type { EndOfDayReport } from "../types";
import { useUiVariant } from "../lib/uiVariant";
import { variantProps, v1Only, v2Only, END_OF_DAY as V1_EOD } from "./adminStyles";

/**
 * Displays the end-of-day financial summary and download controls for the given event.
 *
 * @param props.eventId - The ID of the active swap event whose report should be loaded.
 */
export function EndOfDayPage({ eventId }: { eventId: number }) {
  const [report, setReport] = useState<EndOfDayReport | null>(null);
  const v2 = useUiVariant() === "v2";

  useEffect(() => {
    getEndOfDay(eventId)
      .then(setReport)
      .catch(() => {});
  }, [eventId]);

  return (
    <div {...variantProps(v2, "ui2-eod", V1_EOD.root)}>
      <h3>End of Day</h3>

      <section {...variantProps(v2, "ui2-eod-panel", V1_EOD.panel)}>
        <h4 {...variantProps(v2, "ui2-eod-title", V1_EOD.title)}>Summary</h4>
        {!report && <p>Loading…</p>}
        {report && (
          <>
            <table {...variantProps(v2, "ui2-report-kv", V1_EOD.kvTable)}>
              <tbody>
                {[
                  [
                    "Sales",
                    `${report.sales_count} sale${report.sales_count !== 1 ? "s" : ""}`,
                  ],
                  ["Voided", String(report.voided_count)],
                  ["Gross Revenue", `$${report.gross_revenue.toFixed(2)}`],
                  ["MYSL Total", `$${report.mysl_total.toFixed(2)}`],
                  ["Seller Total", `$${report.seller_total.toFixed(2)}`],
                  ...(report.exempt_lines_total
                    ? [
                        [
                          "Exempt-seller sales (full payout)",
                          `$${report.exempt_lines_total.toFixed(2)}`,
                        ] as [string, string],
                      ]
                    : []),
                  ["Cash", `$${report.cash_total.toFixed(2)}`],
                  ["Check", `$${report.check_total.toFixed(2)}`],
                  ["Card (Square)", `$${report.cc_total.toFixed(2)}`],
                ].map(([label, val]) => (
                  <tr key={label} {...v1Only(v2, V1_EOD.kvRow)}>
                    <td {...v1Only(v2, V1_EOD.kvLabelWide)}>{label}</td>
                    <td {...v1Only(v2, V1_EOD.kvValue)}>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div {...variantProps(v2, "ui2-eod-buttons", V1_EOD.buttonRow)}>
              {(["pdf", "csv", "md"] as const).map((fmt) => {
                const label = fmt === "md" ? "Markdown" : fmt.toUpperCase();
                return (
                  <button
                    key={fmt}
                    onClick={() =>
                      downloadFile(
                        `/reports/${eventId}/end-of-day?format=${fmt}`,
                        `end_of_day_${eventId}.${fmt}`,
                      )
                    }
                    style={v2 ? undefined : V1_EOD.button}
                      {...v2Only(v2, "ui2-btn ui2-btn--secondary")}>
                    {label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section {...variantProps(v2, "ui2-eod-panel", V1_EOD.panelLast)}>
        <h4 {...variantProps(v2, "ui2-eod-title ui2-eod-title--tight", V1_EOD.titleTight)}>
          Database Backup
        </h4>
        <p {...variantProps(v2, "ui2-eod-hint", V1_EOD.hint)}>
          Downloads a ZIP containing the SQLite database and a JSON export.
        </p>
        <button
          onClick={() =>
            downloadFile("/admin/backup", "ski-swap-backup.zip", "POST")
          }
          style={v2 ? undefined : V1_EOD.button}
            {...v2Only(v2, "ui2-btn ui2-btn--primary")}>
          Download Backup
        </button>
      </section>
    </div>
  );
}
