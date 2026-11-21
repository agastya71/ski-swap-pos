import { useEffect, useRef, useState } from "react";
import { IntakePage } from "./IntakePage";
import { ItemSearchPage } from "./ItemSearchPage";
import { SellerListPage } from "../admin/SellerListPage";
import { SellerDetailPage } from "../admin/SellerDetailPage";
import { downloadImportTemplate, importWorksheet } from "../api/items";
import { getActiveEvent } from "../api/events";
import { getSeller } from "../api/sellers";
import { navigate, useHashRoute } from "../lib/useHashRoute";
import { ImportOutcome } from "../components/ImportOutcome";
import { useAuth } from "../auth/AuthContext";
import type {
  Seller,
  SellerMatchReview,
  WorksheetImportResult,
} from "../types";

type IntakeTab = "intake" | "sellers" | "search";

/** Tab URLs relative to the module root (#/intake/...). */
const TAB_HASHES: Record<IntakeTab, string> = {
  intake: "/intake/intake",
  sellers: "/intake/sellers",
  search: "/intake/search",
};

/**
 * Resolves the module's tab and (on the Sellers tab) the open seller id from
 * the URL hash: `#/intake` → Intake workflow · `#/intake/sellers` → seller list
 * · `#/intake/sellers/{id}` → seller detail · `#/intake/search` → item search.
 * Unknown fragments fall back to the Intake workflow tab.
 */
function routeForHash(hash: string): { tab: IntakeTab; sellerId: number | null } {
  const rest = hash.replace(/^\/intake\/?/, "");
  if (rest.startsWith("search")) return { tab: "search", sellerId: null };
  if (rest.startsWith("sellers")) {
    const id = Number(rest.split("/")[1]);
    return { tab: "sellers", sellerId: Number.isInteger(id) && id > 0 ? id : null };
  }
  return { tab: "intake", sellerId: null };
}

/**
 * Top-level intake module page — tab-based navigation between the seller intake
 * workflow and the full sellers list/detail view (accessible to admin and intake roles).
 * The Download Template button is always visible in the tab bar for quick access.
 *
 * Tabs and the open seller live in the URL (`#/intake/...`), so tab switches and
 * list→detail→back navigate through browser history and every tab mounts fresh.
 */
export function IntakeModulePage() {
  const { decoded } = useAuth();
  const eventId = decoded?.event_id ?? 1;
  const hash = useHashRoute();
  const { tab, sellerId } = routeForHash(hash);
  // Seller shown on the detail tab: fetched fresh per URL id.
  const [detailSeller, setDetailSeller] = useState<Seller | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  /** Which seller id the cached detail state belongs to. */
  const [loadedForId, setLoadedForId] = useState<number | null>(null);
  // The event name labels every intake request. Non-critical: if it can't be
  // fetched, the header renders without it.
  const [eventName, setEventName] = useState<string | null>(null);
  // Seller worksheet import (enriched template: seller block + item table).
  const worksheetInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] =
    useState<WorksheetImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // Dedup review: the backend surfaces possible duplicates instead of
  // importing; the kept File is re-submitted with the user's decision.
  const [pendingReview, setPendingReview] = useState<SellerMatchReview | null>(
    null,
  );
  const pendingFileRef = useRef<File | null>(null);
  useEffect(() => {
    getActiveEvent()
      .then((e) => setEventName(e.name))
      .catch(() => {});
  }, []);

  // URL target changed (list↔detail or another seller): drop the cached detail
  // during render — React's "adjust state on prop change" pattern, which is
  // why no setState runs inside the fetch effect below. Non-detail tabs also
  // invalidate the cache so a returned-to detail refetches fresh data.
  const detailTarget = tab === "sellers" ? sellerId : null;
  if (
    (detailSeller !== null || detailError !== null || loadedForId !== null) &&
    loadedForId !== detailTarget
  ) {
    setDetailSeller(null);
    setDetailError(null);
    setLoadedForId(null);
  }

  // Fetch the URL-addressed seller once per target id. A deleted/unknown id
  // surfaces an error and returns to the list (never a silent blank page).
  useEffect(() => {
    if (detailTarget === null || loadedForId === detailTarget) return;
    let alive = true;
    getSeller(detailTarget)
      .then((s) => {
        if (alive) {
          setDetailSeller(s);
          setLoadedForId(detailTarget);
        }
      })
      .catch(() => {
        // Error leaves loadedForId unset, so a re-entered detail retries.
        if (alive) setDetailError(`Seller #${detailTarget} not found.`);
      });
    return () => {
      alive = false;
    };
  }, [detailTarget, loadedForId]);

  /** Navigates to a module tab (a real history entry — Back returns here). */
  function setTab(t: IntakeTab) {
    navigate(TAB_HASHES[t]);
  }

  /** Opens the worksheet file picker. */
  function handlePickWorksheet() {
    setImportResult(null);
    setImportError(null);
    setPendingReview(null);
    pendingFileRef.current = null;
    worksheetInputRef.current?.click();
  }

  /** Uploads the chosen worksheet and either shows the dedup review (the
   * intake user decides duplicate vs new record) or the import summary. */
  async function handleWorksheetChosen(
    file: File,
    opts?: { sellerCode?: string; forceNew?: boolean },
  ) {
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await importWorksheet(file, opts);
      if ("needs_review" in result) {
        pendingFileRef.current = file;
        setPendingReview(result);
      } else {
        setPendingReview(null);
        pendingFileRef.current = null;
        setImportResult(result);
      }
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
            onClick={() => downloadImportTemplate(true)}
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
            Download Vendor Template
          </button>
          <button
            onClick={() => downloadImportTemplate(false)}
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
            Download Non-Vendor Template
          </button>
        </div>
      </div>
      {pendingReview && (
        <div
          role="dialog"
          aria-label="Possible duplicate seller review"
          style={{
            margin: "0 0 16px",
            padding: 12,
            border: "1px solid #f59e0b",
            borderRadius: 6,
            background: "#fffbeb",
          }}
        >
          <strong>⚠ Possible duplicate seller — your decision needed</strong>
          <div style={{ marginTop: 6, fontSize: 13 }}>
            Worksheet seller:{" "}
            <strong>{pendingReview.worksheet_name ?? "(unnamed)"}</strong>
            {pendingReview.worksheet_email && (
              <> · email: {pendingReview.worksheet_email}</>
            )}
            {pendingReview.worksheet_phone && (
              <> · phone: {pendingReview.worksheet_phone}</>
            )}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: "#92400e" }}>
            Why flagged: {pendingReview.reason}
          </div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {pendingReview.candidates.map((c) => (
              <div
                key={c.code}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  border: "1px solid #fde68a",
                  borderRadius: 4,
                  padding: "6px 8px",
                  background: "white",
                }}
              >
                <div style={{ fontSize: 13 }}>
                  <strong>{c.code}</strong> {c.name ?? "(no name)"}
                  {c.email && <> · {c.email}</>}
                  {c.phone && <> · {c.phone}</>}
                  <div style={{ color: "#64748b" }}>
                    {c.match_reason} · {c.existing_intakes} existing intake(s)
                  </div>
                </div>
                <button
                  onClick={() => {
                    const file = pendingFileRef.current;
                    if (file)
                      void handleWorksheetChosen(file, { sellerCode: c.code });
                  }}
                  disabled={importing}
                  style={{
                    background: "white",
                    color: "#1a237e",
                    border: "1px solid #1a237e",
                    padding: "4px 10px",
                    fontSize: 13,
                    borderRadius: 4,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Same seller — use {c.code}
                </button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            Not a duplicate? Record the worksheet as a new seller instead.
          </div>
          <button
            onClick={() => {
              const file = pendingFileRef.current;
              if (file) void handleWorksheetChosen(file, { forceNew: true });
            }}
            disabled={importing}
            style={{
              background: "white",
              color: "#1a237e",
              border: "1px solid #1a237e",
              padding: "4px 10px",
              fontSize: 13,
              borderRadius: 4,
              cursor: "pointer",
              marginTop: 4,
            }}
          >
            No — create as new seller
          </button>
        </div>
      )}
      {importError && (
        <div
          role="status"
          style={{
            margin: "0 0 16px",
            padding: 10,
            border: "1px solid #fca5a5",
            borderRadius: 6,
            background: "#fef2f2",
            fontSize: 13,
          }}
        >
          <span style={{ color: "#b91c1c" }}>{importError}</span>
        </div>
      )}
      {importResult && (
        <ImportOutcome
          result={importResult}
          heading={
            <>
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
            </>
          }
        />
      )}
      {tab === "intake" && <IntakePage />}
      {tab === "search" && <ItemSearchPage />}
      {tab === "sellers" &&
        (sellerId !== null ? (
          loadedForId === sellerId && detailError ? (
            <div>
              <div role="alert" style={{ color: "#b91c1c", marginBottom: 12 }}>
                {detailError}
              </div>
              <button
                onClick={() => navigate("/intake/sellers")}
                style={{
                  border: "1px solid #1a237e",
                  color: "#1a237e",
                  background: "none",
                  padding: "6px 14px",
                  cursor: "pointer",
                  borderRadius: 3,
                }}
              >
                ← Back to Sellers
              </button>
            </div>
          ) : loadedForId === sellerId && detailSeller ? (
            <SellerDetailPage
              key={sellerId}
              seller={detailSeller}
              onBack={() => navigate("/intake/sellers")}
              eventId={eventId}
            />
          ) : (
            <p style={{ color: "#64748b" }}>Loading seller…</p>
          )
        ) : (
          <SellerListPage
            onSelectSeller={(s) => navigate(`/intake/sellers/${s.id}`)}
            eventId={eventId}
          />
        ))}
    </div>
  );
}
