import { useState, useEffect, Fragment } from "react";
import { BUTTON_STYLE } from "../lib/buttons";
import { searchSellers, deleteSeller } from "../api/sellers";
import { SellerForm } from "../intake/SellerForm";
import { SellerPayoutPanel } from "./SellerPayoutPanel";
import type { Seller, SellerListItem } from "../types";

const NAVY = "#1e3a8a";
const MUTED = "#64748b";
const LABEL_DONE = "#15803d";
const LABEL_PARTIAL = "#b45309";
const LABEL_NONE = "#b91c1c";

/**
 * Summarise a seller's label-printing progress for the list's Labels column.
 *
 * Distinguishes the three states intake staff care about: nothing consigned
 * yet, items consigned but no label printed, printing started but unfinished
 * (the common case — items arrive across several visits), and fully printed.
 *
 * @param s - Seller row carrying `item_count` / `labeled_item_count`.
 * @returns Display text, colour and an aria-label spelling the state out.
 */
function labelStatus(s: SellerListItem): {
  text: string;
  color: string;
  aria: string;
} {
  const total = s.item_count;
  const printed = s.labeled_item_count;
  if (total === 0) {
    return { text: "—", color: "#94a3b8", aria: "no items consigned yet" };
  }
  if (printed === 0) {
    return {
      text: "Not yet",
      color: LABEL_NONE,
      aria: `no labels printed yet, ${total} item(s) waiting`,
    };
  }
  if (printed >= total) {
    return {
      text: `All ${total}`,
      color: LABEL_DONE,
      aria: `all ${total} label(s) printed`,
    };
  }
  return {
    text: `${printed}/${total}`,
    color: LABEL_PARTIAL,
    aria: `partial: ${printed} of ${total} label(s) printed`,
  };
}

/**
 * Admin seller list page — debounced search, tabular display, drill-in navigation.
 * Each row has View (navigate to detail), Payout (inline payout panel) and Delete
 * (confirm-gated; only item-less erroneous records — the backend refuses 409
 * otherwise) actions. The Labels column shows whether any price label has been
 * printed for the seller, so staff can see at a glance who still needs tagging.
 * The Vendor column flags commercial vendors (✓) against individual
 * consignors (—) without forcing staff to open each detail page.
 */
export function SellerListPage({
  onSelectSeller,
  eventId,
}: {
  onSelectSeller: (seller: Seller) => void;
  eventId: number;
}) {
  const [query, setQuery] = useState("");
  const [sellers, setSellers] = useState<SellerListItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedPayoutId, setExpandedPayoutId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchSellers(query)
        .then(setSellers)
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function handleCreated(seller: Seller) {
    setShowCreate(false);
    // A seller that was just registered cannot have items yet, so its label
    // counts start at zero rather than being refetched.
    const row: SellerListItem = { ...seller, item_count: 0, labeled_item_count: 0 };
    setSellers((prev) =>
      [...prev, row].sort((a, b) => a.code.localeCompare(b.code)),
    );
  }

  /** Permanently deletes an erroneous seller record (confirm-gated; the
   *  backend refuses with 409 while the seller still has items). */
  async function handleDelete(s: Seller) {
    const displayName =
      s.company ||
      [s.first_name, s.last_name].filter(Boolean).join(" ") ||
      s.code;
    const ok = window.confirm(
      `Delete seller "${displayName} (${s.code})"? This permanently removes ` +
        "the record and its empty intake sessions. Sellers with items cannot " +
        "be deleted. There is no undo.",
    );
    if (!ok) return;
    setError(null);
    try {
      await deleteSeller(s.id);
      setSellers((prev) => prev.filter((x) => x.id !== s.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete seller");
    }
  }

  if (showCreate) {
    return (
      <SellerForm
        onCreated={handleCreated}
        onCancel={() => setShowCreate(false)}
      />
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0 }}>Sellers</h3>
        <button onClick={() => setShowCreate(true)} style={BUTTON_STYLE}>
          Register New Seller
        </button>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or code..."
        style={{
          width: "100%",
          padding: "8px 10px",
          marginBottom: 12,
          border: `1px solid ${NAVY}`,
          borderRadius: 4,
          boxSizing: "border-box",
        }}
      />
      {error && (
        <div role="alert" style={{ color: "red", marginBottom: 12 }}>
          {error}
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
            {["Code", "Name", "Phone", "Email", "Vendor", "Labels", ""].map((h) => (
              <th
                key={h}
                style={{ textAlign: "left", padding: "6px 10px", fontSize: 13 }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sellers.map((s) => {
            const labels = labelStatus(s);
            return (
            <Fragment key={s.id}>
              <tr
                style={{
                  borderBottom:
                    expandedPayoutId === s.id ? "none" : "1px solid #f1f5f9",
                }}
              >
                <td
                  style={{ padding: "8px 10px", fontWeight: 600, color: NAVY }}
                >
                  {s.code}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  {s.first_name} {s.last_name}
                  {s.company ? ` (${s.company})` : ""}
                </td>
                <td style={{ padding: "8px 10px", color: MUTED }}>
                  {s.phone ?? "—"}
                </td>
                <td style={{ padding: "8px 10px", color: MUTED }}>
                  {s.email ?? "—"}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <span
                    aria-label={s.is_vendor ? "vendor seller" : "individual seller"}
                    title={s.is_vendor ? "vendor seller" : "individual seller"}
                    style={{
                      color: s.is_vendor ? LABEL_DONE : "#94a3b8",
                      fontWeight: 600,
                      fontSize: 13,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.is_vendor ? "✓" : "—"}
                  </span>
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <span
                    aria-label={labels.aria}
                    title={labels.aria}
                    style={{
                      color: labels.color,
                      fontWeight: 600,
                      fontSize: 13,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {labels.text}
                  </span>
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => onSelectSeller(s)}
                      style={BUTTON_STYLE}
                    >
                      View →
                    </button>
                    <button
                      onClick={() =>
                        setExpandedPayoutId((prev) =>
                          prev === s.id ? null : s.id,
                        )
                      }
                      style={BUTTON_STYLE}
                    >
                      Payout
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      aria-label={`delete seller ${s.code}`}
                      style={BUTTON_STYLE}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
              {expandedPayoutId === s.id && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: "8px 16px 16px",
                      background: "#f8fafc",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <strong
                      style={{
                        fontSize: 13,
                        display: "block",
                        marginBottom: 8,
                      }}
                    >
                      Seller Payout
                    </strong>
                    <SellerPayoutPanel eventId={eventId} sellerId={s.id} />
                  </td>
                </tr>
              )}
            </Fragment>
            );
          })}
          {sellers.length === 0 && (
            <tr>
              <td
                colSpan={7}
                style={{ padding: 16, textAlign: "center", color: "#94a3b8" }}
              >
                No sellers found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
