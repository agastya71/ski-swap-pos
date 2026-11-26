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
import { getLabelPrinterMode, dispatchSellerLabels } from "../lib/labelPrinter";
import { SellerPayoutPanel } from "./SellerPayoutPanel";
import { ImportOutcome } from "../components/ImportOutcome";import { SellerEquipmentSummaryPanel } from "./SellerEquipmentSummaryPanel";
import { US_STATES } from "../lib/usStates";
import { formatPhone, isUsStateCode } from "../lib/format";
import { useUiVariant } from "../lib/uiVariant";
import { SELLER_DETAIL, v1Only, variantProps } from "./adminStyles";
import type { Seller, Item, Intake, ImportResult } from "../types";

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
  const [importError, setImportError] = useState<string | null>(null);
  const [showPayout, setShowPayout] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [reprintCodeAsText, setReprintCodeAsText] = useState(false);
  const [reprinting, setReprinting] = useState(false);
  const [reprintError, setReprintError] = useState<string | null>(null);
  const [reprintStatus, setReprintStatus] = useState<string | null>(null);
  const v2 = useUiVariant() === "v2";

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
    // #10: save validates state as a real US code — free-typed 2-letter codes
    // are accepted (the edit panel uses a text input, not the dropdown).
    const draftState = (editDraft.state ?? "").trim().toUpperCase();
    if (!draftState) {
      setEditError("State is required.");
      return;
    }
    // #10: free-typed 2-letter US codes are accepted; anything else is rejected
    // with guidance instead of a server 422.
    if (!isUsStateCode(draftState)) {
      setEditError("State must be a 2-letter US state code (e.g. MN).");
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
        phone: editDraft.phone
          ? editDraft.phone.replace(/\D/g, "")
          : undefined,
        email: editDraft.email ?? undefined,
        address: editDraft.address ?? undefined,
        city: editDraft.city ?? undefined,
        state: draftState,
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

  /** Admin seller-level reprint: one tag per on-hand unit across ALL of the
   *  seller's intake sessions, dispatched on the workstation's label-printer
   *  setting (getLabelPrinterMode). Confirm-gated — the server path queues a
   *  real print job the moment it answers, and a vendor can have hundreds of
   *  units on hand. A reprint never changes `label_printed`; the status line
   *  reflects the mode (server = backend's counted items, agent = delivered
   *  locally without ack, download = file saved for manual printing). */
  async function handleReprintLabels() {
    const onHand = items.reduce((sum, it) => sum + it.remaining, 0);
    const ok = window.confirm(
      `Reprint ${onHand} label${onHand !== 1 ? "s" : ""} (one per on-hand ` +
        `unit across all intake sessions) for ${sellerDisplayName(seller)} ` +
        `(${seller.code})? These are reprints — the printed status is not ` +
        "changed.",
    );
    if (!ok) return;
    setReprintError(null);
    setReprintStatus(null);
    setReprinting(true);
    try {
      const mode = getLabelPrinterMode();
      const printed = await dispatchSellerLabels(
        mode,
        seller.id,
        reprintCodeAsText,
        `labels-seller-${seller.code}.zpl`,
      );
      setReprintStatus(
        printed === null
          ? mode === "download"
            ? "Label ZPL saved for manual printing."
            : "Reprint delivered to the locally attached label printer."
          : `Reprinted labels for ${printed} item${printed !== 1 ? "s" : ""} on the server printer.`,
      );
    } catch (err) {
      setReprintError(err instanceof Error ? err.message : "Reprint failed");
    } finally {
      setReprinting(false);
    }
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportResult(null);
    try {
      const intakeId = await getOrCreateIntakeId();
      const result = await importItems(intakeId, file);
      setImportResult(result);
      if (result.imported > 0) {
        listSellerItems(seller.id)
          .then(setItems)
          .catch(() => {});
      }
    } catch (err) {
      // Whole-file rejection (unreadable workbook, missing header row, ...).
      // Show the backend's reason instead of failing silently.
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /** On-hand unit count across every intake — gates the seller-level reprint
   *  button (nothing left to print → disabled, mirroring backend 404). */
  const onHandUnits = items.reduce((sum, it) => sum + it.remaining, 0);

  const contactField = (label: string, value: string | null) => (
    <div {...variantProps(v2, "ui2-sd-contact-row", SELLER_DETAIL.contactRow)}>
      <span {...variantProps(v2, "ui2-sd-contact-label", SELLER_DETAIL.contactLabel)}>
        {label}:
      </span>
      <span>{value ?? "—"}</span>
    </div>
  );

  return (
    <div>
      {/* Back + header */}
      <div {...variantProps(v2, "ui2-sd-back-row", SELLER_DETAIL.backRow)}>
        <button
          onClick={onBack}
          {...variantProps(v2, "ui2-sd-back", SELLER_DETAIL.backButton)}
          aria-label="Back"
        >
          ← Back
        </button>
        <h3 {...variantProps(v2, "ui2-sd-heading", SELLER_DETAIL.heading)}>
          <span {...variantProps(v2, "ui2-sd-code", SELLER_DETAIL.code)}>
            {seller.code}
          </span>
          {sellerDisplayName(seller)}
          <span {...variantProps(v2, "ui2-sd-heading-meta", SELLER_DETAIL.headingMeta)}>
            ({sellerTypeLabel(seller)})
          </span>
          {seller.company && !seller.is_vendor && (
            <span {...variantProps(v2, "ui2-sd-heading-meta", SELLER_DETAIL.headingMeta)}>
              ({seller.company})
            </span>
          )}
        </h3>
      </div>

      {/* Contact card */}
      <div {...variantProps(v2, "ui2-sd-card", SELLER_DETAIL.contactCard)}>
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
              {...variantProps(v2, "ui2-sd-outline", SELLER_DETAIL.outlineButton)}
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
              {...variantProps(v2, "ui2-sd-toggle", SELLER_DETAIL.vendorToggle)}
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
              <div {...variantProps(v2, "ui2-sd-warning", SELLER_DETAIL.vendorWarning)}>
                Changing the vendor flag changes the commission rate applied to
                this seller's payout reports (vendor rate vs standard); the
                seller code stays as-is.
              </div>
            )}
            {(["company"] as const).map((f) => (
              <div key={f} {...variantProps(v2, "ui2-sd-field", SELLER_DETAIL.field)}>
                <label htmlFor={`edit-${f}`}>
                  Company {editDraft.is_vendor ? "*" : "(optional)"}
                </label>
                <input
                  id={`edit-${f}`}
                  value={(editDraft[f] as string) ?? ""}
                  onChange={(e) =>
                    setEditDraft((prev) => ({ ...prev, [f]: e.target.value }))
                  }
                />
              </div>
            ))}
            {(["first_name", "last_name", "phone", "email"] as const).map(
              (f) => (
                <div key={f} {...variantProps(v2, "ui2-sd-field", SELLER_DETAIL.field)}>
                  <label htmlFor={`edit-${f}`}>
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
                    value={
                      f === "phone"
                        ? formatPhone((editDraft[f] as string) ?? "")
                        : ((editDraft[f] as string) ?? "")
                    }
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        [f]:
                          f === "phone"
                            ? formatPhone(e.target.value)
                            : e.target.value,
                      }))
                    }
                  />
                </div>
              ),
            )}
            <fieldset {...variantProps(v2, "ui2-sd-fieldset", SELLER_DETAIL.addressFieldset)}>
              <legend {...variantProps(v2, "ui2-sd-legend", SELLER_DETAIL.legend)}>
                Address
              </legend>
              {/* Address fields rendered identically to the registration form (SellerForm):
                  Street Address + City required, State as a type-able 2-letter US code
                  with a datalist of US states (#10), ZIP 5-digit. */}
              {(["address", "city"] as const).map((f) => (
                <div key={f} {...variantProps(v2, "ui2-sd-field", SELLER_DETAIL.field)}>
                  <label htmlFor={`edit-${f}`}>
                    {f === "address" ? "Street Address" : "City"} *
                  </label>
                  <input
                    id={`edit-${f}`}
                    value={(editDraft[f] as string) ?? ""}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, [f]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <div {...variantProps(v2, "ui2-sd-field", SELLER_DETAIL.field)}>
                <label htmlFor="edit-state">State *</label>
                <input
                  id="edit-state"
                  list="us-state-options"
                  value={editDraft.state ?? ""}
                  maxLength={2}
                  placeholder="MN"
                  onChange={(e) =>
                    setEditDraft((prev) => ({
                      ...prev,
                      state: e.target.value.toUpperCase(),
                    }))
                  }
                />
                <datalist id="us-state-options">
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </datalist>
              </div>
              <div {...variantProps(v2, "ui2-sd-field", SELLER_DETAIL.field)}>
                <label htmlFor="edit-zip">ZIP *</label>
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
                />
              </div>
            </fieldset>
            {editError && (
              <div role="alert" {...variantProps(v2, "ui2-sd-error", SELLER_DETAIL.error)}>
                {editError}
              </div>
            )}
            <div {...variantProps(v2, "ui2-sd-actions", SELLER_DETAIL.actions)}>
              <button
                onClick={handleSaveEdit}
                {...variantProps(v2, "ui2-sd-save", SELLER_DETAIL.saveButton)}
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                {...variantProps(v2, "ui2-sd-cancel", SELLER_DETAIL.cancelButton)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Items table header */}
      <div {...variantProps(v2, "ui2-sd-items-header", SELLER_DETAIL.itemsHeader)}>
        <h4 {...variantProps(v2, "ui2-sd-items-title", SELLER_DETAIL.itemsTitle)}>
          Items ({items.length})
        </h4>
        <div {...variantProps(v2, "ui2-sd-items-actions", SELLER_DETAIL.itemsActions)}>
          <button
            onClick={() => fileInputRef.current?.click()}
            {...variantProps(v2, "ui2-sd-outline", SELLER_DETAIL.smallOutline)}
          >
            Import Items
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv,.tsv"
            className={v2 ? "ui2-hidden" : undefined}
            {...v1Only(v2, SELLER_DETAIL.hiddenFile)}
            onChange={handleImportFile}
          />
          <button
            onClick={() => setShowPayout((prev) => !prev)}
            {...variantProps(v2, "ui2-sd-outline", SELLER_DETAIL.smallOutline)}
          >
            Payout
          </button>
          {/* Admin seller-level reprint: one tag per on-hand unit across ALL
              intake sessions (the per-intake ItemList bulk buttons only span
              their own group). Uses the workstation's label-printer location
              setting; code-as-text mirrors the intake toolbar's option. */}
          <label
            htmlFor="reprint-code-as-text"
            {...variantProps(v2, "ui2-sd-code-toggle", SELLER_DETAIL.codeToggle)}
          >
            <input
              id="reprint-code-as-text"
              type="checkbox"
              checked={reprintCodeAsText}
              disabled={reprinting}
              onChange={(e) => setReprintCodeAsText(e.target.checked)}
              aria-label="Reprint item codes as text instead of barcode"
            />
            Codes as text
          </label>
          <button
            onClick={handleReprintLabels}
            disabled={reprinting || onHandUnits === 0}
            {...variantProps(
              v2,
              "ui2-sd-outline",
              reprinting || onHandUnits === 0
                ? SELLER_DETAIL.smallOutlineDisabled
                : SELLER_DETAIL.smallOutline,
            )}
          >
            Reprint Labels (All Intakes)
          </button>
          <button
            onClick={async () => {
              const id = await getOrCreateIntakeId();
              setAddItemIntakeId(id);
              setShowAddItem(true);
            }}
            {...variantProps(v2, "ui2-sd-outline", SELLER_DETAIL.smallPrimary)}
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Import outcome banner (shared component — identical on every surface) */}
      {importError && (
        <div role="alert" {...variantProps(v2, "ui2-sd-error", SELLER_DETAIL.importError)}>
          {importError}
        </div>
      )}
      {importResult && (
        <ImportOutcome
          result={importResult}
          onDismiss={() => setImportResult(null)}
        />
      )}

      {/* Reprint feedback */}
      {reprintError && (
        <div role="alert" {...variantProps(v2, "ui2-sd-error", SELLER_DETAIL.error)}>
          {reprintError}
        </div>
      )}
      {reprintStatus && (
        <div {...variantProps(v2, "ui2-sd-ok", SELLER_DETAIL.reprintOk)}>
          {reprintStatus}
        </div>
      )}

      {/* Add Item inline form — same panel + footer Cancel as the Intake
          items step (ItemForm owns the Cancel button now; the old floating
          "✕ Cancel" above the form was removed). */}
      {showAddItem && addItemIntakeId !== null && (
        <div {...variantProps(v2, "ui2-sd-panel", SELLER_DETAIL.addItemPanel)}>
          <ItemForm
            intakeId={addItemIntakeId}
            defaultDonateUnsold={seller.donate_unsold_default ?? false}
            onCancel={() => {
              setShowAddItem(false);
              setAddItemIntakeId(null);
            }}
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
            <p {...variantProps(v2, "ui2-sd-no-items", SELLER_DETAIL.noItems)}>
              No items yet — use Add Item or Import Items.
            </p>
          );
        return intakeIds.map((id) => {
          const intake = intakes.find((it) => it.id === id);
          return (
            <div key={id} {...variantProps(v2, "ui2-sd-intake-group", SELLER_DETAIL.intakeGroup)}>
              <h5 {...variantProps(v2, "ui2-sd-intake-heading", SELLER_DETAIL.intakeHeading)}>
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
        <div {...variantProps(v2, "ui2-sd-panel", SELLER_DETAIL.panel)}>
          <strong {...variantProps(v2, "ui2-sd-panel-title", SELLER_DETAIL.panelTitle)}>
            Seller Payout
          </strong>
          <SellerPayoutPanel eventId={eventId} sellerId={seller.id} />
        </div>
      )}

      {/* Vendor equipment-type summary (vendors only, generated on demand) */}
      {seller.is_vendor && (
        <div {...variantProps(v2, "ui2-sd-panel", SELLER_DETAIL.panel)}>
          <strong {...variantProps(v2, "ui2-sd-panel-title", SELLER_DETAIL.panelTitle)}>
            Equipment Type Summary
          </strong>
          <SellerEquipmentSummaryPanel eventId={eventId} sellerId={seller.id} />
        </div>
      )}
    </div>
  );
}
