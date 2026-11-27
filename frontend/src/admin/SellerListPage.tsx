import { useState, useEffect, Fragment } from "react";
import { useUiVariant } from "../lib/uiVariant";
import { SELLER_LIST, v2Only, variantProps } from "./adminStyles";
import { searchSellers, deleteSeller } from "../api/sellers";
import { SellerForm } from "../intake/SellerForm";
import { SellerPayoutPanel } from "./SellerPayoutPanel";
import type { Seller, SellerListItem } from "../types";

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
  /** v2 badge modifier for this state (v1 uses the inline `color`). */
  className: string;
} {
  const total = s.item_count;
  const printed = s.labeled_item_count;
  if (total === 0) {
    return {
      text: "—",
      color: "#94a3b8",
      aria: "no items consigned yet",
      className: "ui2-seller-badge--none",
    };
  }
  if (printed === 0) {
    return {
      text: "Not yet",
      color: LABEL_NONE,
      aria: `no labels printed yet, ${total} item(s) waiting`,
      className: "ui2-seller-badge--none-printed",
    };
  }
  if (printed >= total) {
    return {
      text: `All ${total}`,
      color: LABEL_DONE,
      aria: `all ${total} label(s) printed`,
      className: "ui2-seller-badge--done",
    };
  }
  return {
    text: `${printed}/${total}`,
    color: LABEL_PARTIAL,
    aria: `partial: ${printed} of ${total} label(s) printed`,
    className: "ui2-seller-badge--partial",
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
  const v2 = useUiVariant() === "v2";

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
      <div {...variantProps(v2, "ui2-seller-header", SELLER_LIST.headerRow)}>
        <h3 {...variantProps(v2, "ui2-seller-heading", SELLER_LIST.heading)}>Sellers</h3>
        <button onClick={() => setShowCreate(true)}
            {...v2Only(v2, "ui2-btn ui2-btn--primary")}>Register New Seller</button>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or code..."
        {...variantProps(v2, "ui2-seller-search", SELLER_LIST.search)}
      />
      {error && (
        <div role="alert" {...variantProps(v2, "ui2-sd-error", SELLER_LIST.error)}>
          {error}
        </div>
      )}
      <div {...v2Only(v2, "ui2-scroll-x")}>
      <table {...variantProps(v2, "ui2-seller-table", SELLER_LIST.table)}>
        <thead>
          <tr>
            {["Code", "Name", "Phone", "Email", "Vendor", "Labels", ""].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sellers.map((s) => {
            const labels = labelStatus(s);
            return (
            <Fragment key={s.id}>
              <tr
                {...variantProps(
                  v2,
                  expandedPayoutId === s.id ? "ui2-row--open" : "",
                  SELLER_LIST.row(expandedPayoutId === s.id),
                )}
              >
                <td {...variantProps(v2, "ui2-seller-code", SELLER_LIST.codeCell)}>
                  {s.code}
                </td>
                <td>{s.first_name} {s.last_name}{s.company ? ` (${s.company})` : ""}</td>
                <td {...variantProps(v2, "ui2-seller-muted", SELLER_LIST.mutedCell)}>
                  {s.phone ?? "—"}
                </td>
                <td {...variantProps(v2, "ui2-seller-muted", SELLER_LIST.mutedCell)}>
                  {s.email ?? "—"}
                </td>
                <td>
                  <span
                    aria-label={s.is_vendor ? "vendor seller" : "individual seller"}
                    title={s.is_vendor ? "vendor seller" : "individual seller"}
                    {...variantProps(
                      v2,
                      s.is_vendor
                        ? "ui2-seller-badge--vendor"
                        : "ui2-seller-badge--individual",
                      SELLER_LIST.badge(s.is_vendor ? LABEL_DONE : "#94a3b8"),
                    )}
                  >
                    {s.is_vendor ? "Yes" : "No"}
                  </span>
                </td>
                <td>
                  <span
                    aria-label={labels.aria}
                    title={labels.aria}
                    {...variantProps(v2, labels.className, SELLER_LIST.badge(labels.color))}
                  >
                    {labels.text}
                  </span>
                </td>
                <td>
                  <div {...variantProps(v2, "ui2-seller-actions", SELLER_LIST.actionGroup)}>
                    <button onClick={() => onSelectSeller(s)}
                        {...v2Only(v2, "ui2-btn ui2-btn--secondary")}>View →</button>
                    <button
                      onClick={() =>
                        setExpandedPayoutId((prev) =>
                          prev === s.id ? null : s.id,
                        )
                      }
                        {...v2Only(v2, "ui2-btn ui2-btn--secondary")}>
                      Payout
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      aria-label={`delete seller ${s.code}`}
                        {...v2Only(v2, "ui2-btn ui2-btn--danger")}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
              {expandedPayoutId === s.id && (
                <tr>
                  <td
                    colSpan={7}
                    {...variantProps(v2, "ui2-seller-payout-cell", SELLER_LIST.payoutCell)}
                  >
                    <strong
                      {...variantProps(v2, "ui2-seller-payout-title", SELLER_LIST.payoutTitle)}
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
                {...variantProps(v2, "ui2-seller-empty", SELLER_LIST.emptyCell)}
              >
                No sellers found
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
