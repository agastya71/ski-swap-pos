import { useEffect, useRef, useState } from "react";
import { IntakePage } from "./IntakePage";
import { ItemSearchPage } from "./ItemSearchPage";
import { SellerListPage } from "../admin/SellerListPage";
import { SellerDetailPage } from "../admin/SellerDetailPage";
import { downloadImportTemplate, importWorksheet } from "../api/items";
import { getActiveEvent } from "../api/events";
import { useAuth } from "../auth/AuthContext";
import type { Seller, WorksheetImportResult } from "../types";

type IntakeTab = "intake" | "sellers" | "search";

/**
 * Top-level intake module page — tab-based navigation between the seller intake
 * workflow and the full sellers list/detail view (accessible to admin and intake roles).
 * The Download Template button is always visible in the tab bar for quick access.
 */
export function IntakeModulePage() {
  const { decoded } = useAuth();
  const eventId = decoded?.event_id ?? 1;
  const [tab, setTab] = useState<IntakeTab>("intake");
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  // The event name labels every intake request. Non-critical: if it can't be
  // fetched, the header renders without it.
  const [eventName, setEventName] = useState<string | null>(null);
  // Seller worksheet import (enriched template: seller block + item table).
  const worksheetInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] =
    useState<WorksheetImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  useEffect(() => {
    getActiveEvent()
      .then((e) => setEventName(e.name))
      .catch(() => {});
  }, []);

  /** Opens the worksheet file picker. */
  function handlePickWorksheet() {
    setImportResult(null);
    setImportError(null);
    worksheetInputRef.current?.click();
  }

  /** Uploads the chosen worksheet and shows the seller/import summary. */
  async function handleWorksheetChosen(file: File) {
    setImporting(true);
    setImportError(null);
    try {
      const result = await importWorksheet(file);
      setImportResult(result);
    } catch (err) {
      setImportResult(null);
      setImportError(
        err instanceof Error ? err.message : "Worksheet import failed",
      );
    } finally {
      setImporting(false);
    }
  }

  const tabBtn = (t: IntakeTab, label: string) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      aria-current={tab === t ? "page" : undefined}
      style={{
        padding: "6px 16px",
        background: tab === t ? "#1a237e" : "transparent",
        color: tab === t ? "white" : "#1a237e",
        border: "1px solid #1a237e",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "2px solid #1a237e",
          paddingBottom: 8,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          {tabBtn("intake", "Intake")}
          {tabBtn("sellers", "Sellers")}
          {tabBtn("search", "Search")}
        </div>
        {eventName && <strong style={{ fontSize: 16 }}>{eventName}</strong>}
        <div style={{ display: "flex", gap: 8 }}>
          {/* Import a seller worksheet: creates/matches the seller, then the items. */}
          <button
            onClick={handlePickWorksheet}
            disabled={importing}
            style={{
              border: "1px solid #1a237e",
              color: "#1a237e",
              background: "none",
              padding: "4px 10px",
              cursor: importing ? "wait" : "pointer",
              borderRadius: 3,
              fontSize: 13,
            }}
          >
            {importing ? "Importing…" : "Import Seller Worksheet"}
          </button>
          <input
            ref={worksheetInputRef}
            type="file"
            accept=".xlsx,.csv,.tsv"
            style={{ display: "none" }}
            aria-label="Choose seller worksheet file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleWorksheetChosen(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => downloadImportTemplate()}
            style={{
              border: "1px solid #1a237e",
              color: "#1a237e",
              background: "none",
              padding: "4px 10px",
              cursor: "pointer",
              borderRadius: 3,
              fontSize: 13,
            }}
          >
            Download Template
          </button>
        </div>
      </div>
      {(importResult || importError) && (
        <div
          role="status"
          style={{
            margin: "0 0 16px",
            padding: 10,
            border: importError ? "1px solid #fca5a5" : "1px solid #86efac",
            borderRadius: 6,
            background: importError ? "#fef2f2" : "#f0fdf4",
            fontSize: 13,
          }}
        >
          {importError ? (
            <span style={{ color: "#b91c1c" }}>{importError}</span>
          ) : (
            importResult && (
              <span>
                <strong>{importResult.seller_name}</strong> (
                {importResult.seller_code}) —{" "}
                {importResult.seller_created
                  ? "new seller created"
                  : `existing seller matched by ${importResult.seller_matched_by}`}{" "}
                ·{" "}
                {importResult.intake_created ? "new intake" : "existing intake"}{" "}
                · {importResult.imported} item(s) imported
                {importResult.skipped > 0 &&
                  `, ${importResult.skipped} row(s) skipped`}
              </span>
            )
          )}
        </div>
      )}
      {tab === "intake" && <IntakePage />}
      {tab === "search" && <ItemSearchPage />}
      {tab === "sellers" &&
        (selectedSeller ? (
          <SellerDetailPage
            seller={selectedSeller}
            onBack={() => setSelectedSeller(null)}
            eventId={eventId}
          />
        ) : (
          <SellerListPage
            onSelectSeller={setSelectedSeller}
            eventId={eventId}
          />
        ))}
    </div>
  );
}
