import { useEffect, useState } from "react";
import { IntakePage } from "./IntakePage";
import { ItemSearchPage } from "./ItemSearchPage";
import { SellerListPage } from "../admin/SellerListPage";
import { SellerDetailPage } from "../admin/SellerDetailPage";
import { downloadImportTemplate } from "../api/items";
import { getActiveEvent } from "../api/events";
import { useAuth } from "../auth/AuthContext";
import type { Seller } from "../types";

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
  useEffect(() => {
    getActiveEvent()
      .then((e) => setEventName(e.name))
      .catch(() => {});
  }, []);

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
