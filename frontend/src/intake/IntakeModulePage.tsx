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
import { useUiVariant } from "../lib/uiVariant";
import { INTAKE_MODULE, variantProps } from "./intakeStyles";
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
  const v2 = useUiVariant() === "v2";
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
      {...variantProps(v2, "ui2-intake-tab", INTAKE_MODULE.tab(tab === t))}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div {...variantProps(v2, "ui2-intake-tabbar", INTAKE_MODULE.tabBar)}>
        <div {...variantProps(v2, "ui2-intake-tabs", INTAKE_MODULE.tabGroup)}>
          {tabBtn("intake", "Intake")}
          {tabBtn("sellers", "Sellers")}
          {tabBtn("search", "Search")}
        </div>
        {eventName && (
          <strong {...variantProps(v2, "ui2-intake-event-name", INTAKE_MODULE.eventName)}>
            {eventName}
          </strong>
        )}
        <div {...variantProps(v2, "ui2-intake-tab-actions", INTAKE_MODULE.actionGroup)}>
          {/* Import a seller worksheet: creates/matches the seller, then the items. */}
          <button
            onClick={handlePickWorksheet}
            disabled={importing}
            {...variantProps(
              v2,
              "ui2-intake-ghost-btn",
              INTAKE_MODULE.ghostButton(importing),
            )}
          >
            {importing ? "Importing…" : "Import Seller Worksheet"}
          </button>
          <input
            ref={worksheetInputRef}
            type="file"
            accept=".xlsx,.csv,.tsv"
            style={INTAKE_MODULE.hiddenInput}
            aria-label="Choose seller worksheet file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleWorksheetChosen(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => downloadImportTemplate(true)}
            {...variantProps(
              v2,
              "ui2-intake-ghost-btn",
              INTAKE_MODULE.ghostButton(),
            )}
          >
            Download Vendor Template
          </button>
          <button
            onClick={() => downloadImportTemplate(false)}
            {...variantProps(
              v2,
              "ui2-intake-ghost-btn",
              INTAKE_MODULE.ghostButton(),
            )}
          >
            Download Non-Vendor Template
          </button>
        </div>
      </div>
      {pendingReview && (
        <div
          role="dialog"
          aria-label="Possible duplicate seller review"
          {...variantProps(v2, "ui2-intake-review", INTAKE_MODULE.reviewPanel)}
        >
          <strong {...variantProps(v2, "ui2-intake-review-title", {})}>
            ⚠ Possible duplicate seller — your decision needed
          </strong>
          <div {...variantProps(v2, "ui2-intake-review-meta", INTAKE_MODULE.reviewMeta)}>
            Worksheet seller:{" "}
            <strong>{pendingReview.worksheet_name ?? "(unnamed)"}</strong>
            {pendingReview.worksheet_email && (
              <> · email: {pendingReview.worksheet_email}</>
            )}
            {pendingReview.worksheet_phone && (
              <> · phone: {pendingReview.worksheet_phone}</>
            )}
          </div>
          <div
            {...variantProps(
              v2,
              "ui2-intake-review-reason",
              INTAKE_MODULE.reviewReason,
            )}
          >
            Why flagged: {pendingReview.reason}
          </div>
          <div
            {...variantProps(v2, "ui2-intake-candidates", INTAKE_MODULE.candidateList)}
          >
            {pendingReview.candidates.map((c) => (
              <div
                key={c.code}
                {...variantProps(v2, "ui2-intake-candidate", INTAKE_MODULE.candidateRow)}
              >
                <div
                  {...variantProps(
                    v2,
                    "ui2-intake-candidate-info",
                    INTAKE_MODULE.candidateInfo,
                  )}
                >
                  <strong>{c.code}</strong> {c.name ?? "(no name)"}
                  {c.email && <> · {c.email}</>}
                  {c.phone && <> · {c.phone}</>}
                  <div
                    {...variantProps(
                      v2,
                      "ui2-intake-candidate-sub",
                      INTAKE_MODULE.candidateSub,
                    )}
                  >
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
                  {...variantProps(
                    v2,
                    "ui2-btn ui2-btn--secondary",
                    INTAKE_MODULE.candidateButton,
                  )}
                >
                  Same seller — use {c.code}
                </button>
              </div>
            ))}
          </div>
          <div
            {...variantProps(v2, "ui2-intake-review-foot", INTAKE_MODULE.reviewFoot)}
          >
            Not a duplicate? Record the worksheet as a new seller instead.
          </div>
          <button
            onClick={() => {
              const file = pendingFileRef.current;
              if (file) void handleWorksheetChosen(file, { forceNew: true });
            }}
            disabled={importing}
            {...variantProps(
              v2,
              "ui2-btn ui2-btn--secondary ui2-intake-force-new",
              INTAKE_MODULE.forceNewButton,
            )}
          >
            No — create as new seller
          </button>
        </div>
      )}
      {importError && (
        <div
          role="status"
          {...variantProps(
            v2,
            "ui2-intake-import-error-panel",
            INTAKE_MODULE.importErrorPanel,
          )}
        >
          <span
            {...variantProps(
              v2,
              "ui2-intake-import-error-text",
              INTAKE_MODULE.importErrorText,
            )}
          >
            {importError}
          </span>
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
              <div
                role="alert"
                {...variantProps(
                  v2,
                  "ui2-intake-detail-error",
                  INTAKE_MODULE.detailError,
                )}
              >
                {detailError}
              </div>
              <button
                onClick={() => navigate("/intake/sellers")}
                {...variantProps(
                  v2,
                  "ui2-intake-ghost-btn",
                  INTAKE_MODULE.backButton,
                )}
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
            <p
              {...variantProps(
                v2,
                "ui2-intake-loading",
                INTAKE_MODULE.loadingText,
              )}
            >
              Loading seller…
            </p>
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
