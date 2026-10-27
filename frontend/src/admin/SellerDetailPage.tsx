/**
 * Admin seller detail page — contact card with inline edit, the intake-style
 * items view (ItemList reused per intake session: same columns, row actions,
 * label printing, and expand-below edit panel), Add Item form, Excel import,
 * and inline payout panel.
 *
 * @module SellerDetailPage
 */
import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { updateSeller, listSellerItems } from "../api/sellers";
import { sellerDisplayName, sellerTypeLabel } from "../lib/sellerDisplay";
import { getSellerIntakes, createIntake, importItems } from "../api/intakes";
import { ItemForm } from "../intake/ItemForm";
import { ItemList } from "../intake/ItemList";
import { SellerPayoutPanel } from "./SellerPayoutPanel";
import { SellerEquipmentSummaryPanel } from "./SellerEquipmentSummaryPanel";
import { US_STATES } from "../lib/usStates";
import type { Seller, Item, Intake, ImportResult } from "../types";

const NAVY = "#1e3a8a";

export function SellerDetailPage({
  seller: initialSeller,
  onBack,
  eventId,
}: {
  seller: Seller;
  onBack: () => void;
  eventId: number;
}) {
  const [seller, setSeller] = useState<Seller>(initialSeller);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Seller>(initialSeller);
  const [items, setItems] = useState<Item[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemIntakeId, setAddItemIntakeId] = useState<number | null>(null);
  const [intakes, setIntakes] = useState<Intake[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showPayout, setShowPayout] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editError, setEditError] = useState<string | null>(null);

  /** Re-fetches the seller's items after any ItemList mutation. */
  function refreshItems() {
    listSellerItems(seller.id)
      .then(setItems)
      .catch(() => {});
  }

  useEffect(() => {
    refreshItems();
    getSellerIntakes(seller.id)
      .then(setIntakes)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seller.id]);

  async function handleSaveEdit() {
    setEditError(null);
    // Cross-field contract, same rules as registration (SellerCreate): a vendor
    // needs a company; an individual needs first + last name; at least one
    // contact channel. The backend re-validates the resulting record.
    if (!editDraft.phone?.trim() && !editDraft.email?.trim()) {
      setEditError("At least one of phone or email is required.");
      return;
    }
    if (editDraft.is_vendor && !(editDraft.company ?? "").trim()) {
      setEditError("Company is required for vendor sellers.");
      return;
    }
    if (
      !editDraft.is_vendor &&
      (!(editDraft.first_name ?? "").trim() ||
        !(editDraft.last_name ?? "").trim())
    ) {
      setEditError("First and last name are required for individual sellers.");
      return;
    }
    // Same mandatory-field rules as the registration form (SellerForm):
    // state is a 2-char US code, ZIP is 5 digits, street address and city are
    // required — enforced client-side since this panel saves via a button (no
    // native form submission). Also surface API errors visibly instead of
    // swallowing them.
    const zip = (editDraft.zip ?? "").trim();
    if (!editDraft.address?.trim() || !editDraft.city?.trim()) {
      setEditError("Street address and city are required.");
      return;
    }
    if (!editDraft.state?.trim()) {
      setEditError("State is required.");
      return;
    }
    if (!/^\d{5}$/.test(zip)) {
      setEditError("ZIP must be a 5-digit US ZIP code.");
      return;
    }
    try {
      const updated = await updateSeller(seller.id, {
        first_name: editDraft.first_name ?? undefined,
        last_name: editDraft.last_name ?? undefined,
        company: editDraft.company ?? undefined,
        is_vendor: editDraft.is_vendor,
        phone: editDraft.phone ?? undefined,
        email: editDraft.email ?? undefined,
        address: editDraft.address ?? undefined,
        city: editDraft.city ?? undefined,
        state: editDraft.state ?? undefined,
        zip: editDraft.zip ?? undefined,
      });
      setSeller(updated);
      setEditing(false);
    } catch (err) {
      // keep editing open so the user can retry
      setEditError(
        err instanceof Error ? err.message : "Failed to save changes",
      );
    }
  }
  async function getOrCreateIntakeId(): Promise<number> {
    if (intakes.length > 0) return intakes[0].id;
    const intake = await createIntake({ seller_id: seller.id });
    setIntakes([intake]);
    return intake.id;
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const intakeId = await getOrCreateIntakeId();
    const result = await importItems(intakeId, file);
    setImportResult(result);
    if (result.imported > 0) {
      listSellerItems(seller.id)
        .then(setItems)
        .catch(() => {});
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const contactField = (label: string, value: string | null) => (
    <div style={{ marginBottom: 4 }}>
      <span style={{ color: "#64748b", fontSize: 13, marginRight: 6 }}>
        {label}:
      </span>
      <span>{value ?? "—"}</span>
    </div>
  );

  return (
    <div>
      {/* Back + header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <button
          onClick={onBack}
          style={{
            border: "none",
            background: "none",
            color: NAVY,
            cursor: "pointer",
            fontSize: 14,
          }}
          aria-label="Back"
        >
          ← Back
        </button>
        <h3 style={{ margin: 0 }}>
          <span style={{ color: NAVY, marginRight: 8 }}>{seller.code}</span>
          {sellerDisplayName(seller)}
          <span style={{ color: "#64748b", fontWeight: 400, marginLeft: 8 }}>
            ({sellerTypeLabel(seller)})
          </span>
          {seller.company && !seller.is_vendor && (
            <span style={{ color: "#64748b", fontWeight: 400, marginLeft: 8 }}>
              ({seller.company})
            </span>
          )}
        </h3>
      </div>

      {/* Contact card */}
      <div
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 6,
          padding: 16,
          marginBottom: 20,
        }}
      >
        {!editing ? (
          <>
            {contactField("Type", seller.is_vendor ? "Vendor" : "Individual")}
            {contactField("Phone", seller.phone)}
            {contactField("Email", seller.email)}
            {contactField(
              "Address",
              seller.address
                ? `${seller.address}, ${seller.city ?? ""} ${seller.state ?? ""} ${seller.zip ?? ""}`.trim()
                : null,
            )}
            <button
              onClick={() => {
                setEditDraft(seller);
                setEditError(null);
                setEditing(true);
              }}
              style={{
                marginTop: 8,
                border: `1px solid ${NAVY}`,
                color: NAVY,
                background: "none",
                padding: "4px 12px",
                cursor: "pointer",
                borderRadius: 3,
              }}
            >
              Edit
            </button>
          </>
        ) : (
          <div>
            {/* Vendor/Individual flag — editable in edit mode. The same
                creation contract is enforced client-side here and again
                server-side against the resulting record (PATCH /sellers). */}
            <label
              htmlFor="edit-is_vendor"
              style={{ display: "block", marginBottom: 8, fontSize: 13 }}
            >
              <input
                id="edit-is_vendor"
                type="checkbox"
                checked={editDraft.is_vendor}
                onChange={(e) =>
                  setEditDraft((prev) => ({
                    ...prev,
                    is_vendor: e.target.checked,
                  }))
                }
              />{" "}
              Vendor (not individual consignor)
            </label>
            {editDraft.is_vendor !== seller.is_vendor && (
              <div style={{ fontSize: 12, color: "#b45309", marginBottom: 8 }}>
                Changing the vendor flag changes the commission rate applied to
                this seller's payout reports (vendor rate vs standard); the
                seller code stays as-is.
              </div>
            )}
            {(["company"] as const).map((f) => (
              <div key={f} style={{ marginBottom: 8 }}>
                <label
                  htmlFor={`edit-${f}`}
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "#64748b",
                    marginBottom: 2,
                  }}
                >
                  Company {editDraft.is_vendor ? "*" : "(optional)"}
                </label>
                <input
                  id={`edit-${f}`}
                  value={(editDraft[f] as string) ?? ""}
                  onChange={(e) =>
                    setEditDraft((prev) => ({ ...prev, [f]: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "5px 8px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            ))}
            {(["first_name", "last_name", "phone", "email"] as const).map(
              (f) => (
                <div key={f} style={{ marginBottom: 8 }}>
                  <label
                    htmlFor={`edit-${f}`}
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#64748b",
                      marginBottom: 2,
                    }}
                  >
                    {f === "first_name"
                      ? "First Name"
                      : f === "last_name"
                        ? "Last Name"
                        : f === "phone"
                          ? "Phone (10 digits)"
                          : "Email"}
                  </label>
                  <input
                    id={`edit-${f}`}
                    value={(editDraft[f] as string) ?? ""}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, [f]: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "5px 8px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              ),
            )}
            <fieldset
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 4,
                padding: "10px 12px",
                marginBottom: 8,
              }}
            >
              <legend style={{ fontSize: 12, color: "#64748b" }}>
                Address
              </legend>
              {/* Address fields rendered identically to the registration form (SellerForm):
                  Street Address + City required, State as the 2-char US dropdown, ZIP 5-digit. */}
              {(["address", "city"] as const).map((f) => (
                <div key={f} style={{ marginBottom: 8 }}>
                  <label
                    htmlFor={`edit-${f}`}
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#64748b",
                      marginBottom: 2,
                    }}
                  >
                    {f === "address" ? "Street Address" : "City"} *
                  </label>
                  <input
                    id={`edit-${f}`}
                    value={(editDraft[f] as string) ?? ""}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, [f]: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "5px 8px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              ))}
              <div style={{ marginBottom: 8 }}>
                <label
                  htmlFor="edit-state"
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "#64748b",
                    marginBottom: 2,
                  }}
                >
                  State *
                </label>
                <select
                  id="edit-state"
                  value={editDraft.state ?? ""}
                  onChange={(e) =>
                    setEditDraft((prev) => ({ ...prev, state: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "5px 8px",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="">— select state —</option>
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label
                  htmlFor="edit-zip"
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "#64748b",
                    marginBottom: 2,
                  }}
                >
                  ZIP *
                </label>
                <input
                  id="edit-zip"
                  value={editDraft.zip ?? ""}
                  maxLength={5}
                  inputMode="numeric"
                  onChange={(e) =>
                    setEditDraft((prev) => ({
                      ...prev,
                      zip: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "5px 8px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </fieldset>
            {editError && (
              <div
                role="alert"
                style={{ color: "red", marginBottom: 8, fontSize: 13 }}
              >
                {editError}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={handleSaveEdit}
                style={{
                  background: NAVY,
                  color: "#fff",
                  border: "none",
                  padding: "5px 14px",
                  cursor: "pointer",
                  borderRadius: 3,
                }}
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                style={{
                  border: "1px solid #94a3b8",
                  background: "none",
                  padding: "5px 14px",
                  cursor: "pointer",
                  borderRadius: 3,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Items table header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <h4 style={{ margin: 0 }}>Items ({items.length})</h4>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `1px solid ${NAVY}`,
              color: NAVY,
              background: "none",
              padding: "4px 10px",
              cursor: "pointer",
              borderRadius: 3,
              fontSize: 13,
            }}
          >
            Import Items
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv,.tsv"
            style={{ display: "none" }}
            onChange={handleImportFile}
          />
          <button
            onClick={() => setShowPayout((prev) => !prev)}
            style={{
              border: `1px solid ${NAVY}`,
              color: NAVY,
              background: "none",
              padding: "4px 10px",
              cursor: "pointer",
              borderRadius: 3,
              fontSize: 13,
            }}
          >
            Payout
          </button>
          <button
            onClick={async () => {
              const id = await getOrCreateIntakeId();
              setAddItemIntakeId(id);
              setShowAddItem(true);
            }}
            style={{
              background: NAVY,
              color: "#fff",
              border: "none",
              padding: "4px 10px",
              cursor: "pointer",
              borderRadius: 3,
              fontSize: 13,
            }}
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div
          style={{
            background: importResult.skipped > 0 ? "#fef3c7" : "#f0fdf4",
            border: "1px solid",
            borderColor: importResult.skipped > 0 ? "#fcd34d" : "#86efac",
            borderRadius: 4,
            padding: "8px 12px",
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          Imported {importResult.imported} item
          {importResult.imported !== 1 ? "s" : ""}.
          {importResult.skipped > 0 &&
            ` Skipped ${importResult.skipped} row${importResult.skipped !== 1 ? "s" : ""}: ${importResult.errors.map((e) => `row ${e.row}: ${e.reason}`).join("; ")}`}
          <button
            onClick={() => setImportResult(null)}
            style={{
              marginLeft: 8,
              border: "none",
              background: "none",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Add Item inline form */}
      {showAddItem && addItemIntakeId !== null && (
        <div
          style={{
            marginBottom: 16,
            padding: 16,
            border: "1px solid #e2e8f0",
            borderRadius: 6,
          }}
        >
          <button
            onClick={() => {
              setShowAddItem(false);
              setAddItemIntakeId(null);
            }}
            style={{
              float: "right",
              border: "none",
              background: "none",
              cursor: "pointer",
              color: "#64748b",
            }}
          >
            ✕ Cancel
          </button>
          <ItemForm
            intakeId={addItemIntakeId}
            defaultDonateUnsold={seller.donate_unsold_default ?? false}
            onAdded={(item) => {
              setItems((prev) => [...prev, item]);
              setShowAddItem(false);
              setAddItemIntakeId(null);
            }}
          />
        </div>
      )}

      {/* Items — grouped per intake session, EXACT intake view/actions
          (shared ItemList: same columns, Print All/Print N, Edit panel with
          quantity adjust, Donate toggle, row Delete, label-printer selector,
          code-as-text, bulk Print All, totals). */}
      {(() => {
        const intakeIds = Array.from(
          new Set(items.map((i) => i.intake_id)),
        ).sort((a, b) => a - b);
        if (intakeIds.length === 0)
          return (
            <p style={{ color: "#94a3b8", padding: 8 }}>
              No items yet — use Add Item or Import Items.
            </p>
          );
        return intakeIds.map((id) => {
          const intake = intakes.find((it) => it.id === id);
          return (
            <div key={id} style={{ marginBottom: 24 }}>
              <h5
                style={{
                  margin: "0 0 6px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#64748b",
                }}
              >
                Intake #{id}
                {intake?.date_entered ? ` — entered ${intake.date_entered}` : ""}
              </h5>
              <ItemList
                items={items.filter((i) => i.intake_id === id)}
                intakeId={id}
                onItemsChanged={refreshItems}
              />
            </div>
          );
        });
      })()}

      {/* Payout panel */}
      {showPayout && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
          }}
        >
          <strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
            Seller Payout
          </strong>
          <SellerPayoutPanel eventId={eventId} sellerId={seller.id} />
        </div>
      )}

      {/* Vendor equipment-type summary (vendors only, generated on demand) */}
      {seller.is_vendor && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
          }}
        >
          <strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
            Equipment Type Summary
          </strong>
          <SellerEquipmentSummaryPanel eventId={eventId} sellerId={seller.id} />
        </div>
      )}
    </div>
  );
}
