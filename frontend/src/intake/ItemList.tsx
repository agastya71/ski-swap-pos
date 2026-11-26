/**
 * Item list table for an intake session — displays all consigned items with
 * per-item Edit (expand-below panel), per-row Delete (also available inside the
 * edit panel), Print Label, and bulk Print All Labels actions. Row-level Delete
 * (added 2026-08-29 after tester feedback) carries the same soft-delete
 * guardrails: disabled for label-printed or sold items with a tooltip reason.
 *
 * @module ItemList
 */
import { Fragment, useState } from "react";
import {
  adjustItemQuantity,
  deleteItem,
  updateItem,
} from "../api/items";
import { BUTTON_STYLE } from "../lib/buttons";
import { capitalizeWords } from "../lib/format";
import {
  dispatchIntakeLabels,
  dispatchItemLabel,
  getLabelPrinterMode,
  setLabelPrinterMode,
  type LabelPrinterMode,
} from "../lib/labelPrinter";
import { CATEGORIES, typesForCategory } from "../lib/itemSizes";
import type { Item, ItemUpdate } from "../types";
import {
  ITEM_LIST,
  variantProps,
  v1Only,
  v2Only,
} from "./intakeStyles";
import { useUiVariant } from "../lib/uiVariant";
import { TableScroll } from "../components/ui/primitives";

/**
 * Renders a tabular list of items belonging to a single intake session.
 * Provides per-item Edit panel (category, type, brand, description, size,
 * sell price — 2026-09-18; Gender/Age and Color suppressed), Print Label,
 * and Delete (inside the edit panel, disabled if label printed) actions,
 * plus a bulk Print All Labels button.
 *
 * @param props.items - Array of {@link Item} objects to display.
 * @param props.intakeId - ID of the parent intake session, used for bulk label printing.
 * @param props.onItemsChanged - Callback invoked after any mutation so the parent can re-fetch.
 */
export function ItemList({
  items,
  intakeId,
  onItemsChanged,
}: {
  items: Item[];
  intakeId: number;
  onItemsChanged: () => void;
}) {
  const [expandedEditId, setExpandedEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState({
    category: "",
    description: "",
    price: "",
    brand: "",
    type: "",
    size: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Per-row quantity-adjust state (keyed by item id) so switching rows keeps
  // drafts separate (#5), plus a target-count entry mode with live preview.
  const [qtyAdjust, setQtyAdjust] = useState<Record<number, string>>({});
  const [qtyError, setQtyError] = useState<Record<number, string | null>>({});
  // Per-row label-print counts ("print a specified number of labels per item").
  const [printQty, setPrintQty] = useState<Record<number, string>>({});
  const [printError, setPrintError] = useState<string | null>(null);
  // Print the item code as text instead of a barcode (applies to every label
  // printed from this list: per-item and bulk).
  const [codeAsText, setCodeAsText] = useState(false);
  // Where labels print: the server-attached Zebra (original behavior) or a
  // Zebra attached to THIS workstation via the Browser Print agent, or a
  // downloaded .zpl file. Persisted per workstation.
  const [printerMode, setPrinterMode] = useState<LabelPrinterMode>(
    getLabelPrinterMode(),
  );
  // Inline donate-unsold toggle per line item (PATCHes immediately).
  const [donatePendingId, setDonatePendingId] = useState<number | null>(null);
  const [donateError, setDonateError] = useState<string | null>(null);
  const v2 = useUiVariant() === "v2";

  /** Opens the edit panel for the given item, or closes it if already open. */
  function openEdit(item: Item) {
    if (expandedEditId === item.id) {
      setExpandedEditId(null);
      return;
    }
    setExpandedEditId(item.id);
    setDraft({
      category: item.category ?? "",
      description: item.description ?? "",
      price: String(item.price),
      brand: item.brand ?? "",
      type: item.type ?? "",
      size: item.size ?? "",
    });
    setSaveError(null);
  }

  /** Deletes a single item by ID (soft delete; backend refuses once a label is
   *  printed or the item sold), closes the panel, and notifies the parent. */
  async function handleDelete(id: number) {
    setDeleteError(null);
    try {
      await deleteItem(id);
      setExpandedEditId(null);
      onItemsChanged();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete item",
      );
    }
  }

  /** Adjusts the item's on-hand quantity by a signed delta and refreshes (#5).
   *  Accepts either a signed delta ("3", "-2") or a target count ("=8"). */
  async function handleAdjustQty(itemId: number, raw: string) {
    const current = items.find((i) => i.id === itemId)?.remaining ?? 0;
    const input = raw.trim();
    const delta = input.startsWith("=")
      ? (parseInt(input.slice(1), 10) || 0) - current
      : parseInt(input, 10);
    if (Number.isNaN(delta) || delta === 0) return;
    setQtyError((p) => ({ ...p, [itemId]: null }));
    try {
      await adjustItemQuantity(itemId, delta);
      setQtyAdjust((p) => ({ ...p, [itemId]: "" }));
      onItemsChanged();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to adjust quantity";
      setQtyError((p) => ({ ...p, [itemId]: message }));
    }
  }

  /** Toggles the item's donate-unsold election inline and refreshes the list. */
  async function handleToggleDonate(item: Item) {
    setDonateError(null);
    setDonatePendingId(item.id);
    try {
      await updateItem(item.id, { donate_unsold: !item.donate_unsold });
      onItemsChanged();
    } catch (err) {
      setDonateError(
        err instanceof Error ? err.message : "Failed to update the donate flag",
      );
    } finally {
      setDonatePendingId(null);
    }
  }

  /** PATCHes the item with only the fields that changed, closes the panel, and notifies the parent. */
  async function handleSave(itemId: number) {
    setSaving(true);
    setSaveError(null);
    try {
      const original = items.find((i) => i.id === itemId)!;
      const update: Record<string, string | number> = {};
      if (draft.category !== (original.category ?? ""))
        update.category = draft.category;
      if (draft.description !== (original.description ?? ""))
        update.description = draft.description;
      if (parseFloat(draft.price) !== original.price)
        update.price = parseFloat(draft.price);
      if (draft.brand !== (original.brand ?? "")) update.brand = draft.brand;
      if (draft.type !== (original.type ?? "")) update.type = draft.type;
      if (draft.size !== (original.size ?? "")) update.size = draft.size;
      await updateItem(itemId, update as ItemUpdate);
      setExpandedEditId(null);
      onItemsChanged();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  /** Prints labels for every remaining unit of a single item ("all labels per
   *  item"), dispatching on the workstation's label-printer setting. */
  async function handlePrintOne(id: number) {
    setPrintError(null);
    try {
      const item = items.find((i) => i.id === id);
      await dispatchItemLabel(
        printerMode,
        id,
        undefined,
        codeAsText,
        `label-${item?.code ?? id}.zpl`,
      );
      onItemsChanged();
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Print failed");
    }
  }

  /** Prints an explicitly-specified number of labels for a single item. */
  async function handlePrintCopies(id: number, count: number) {
    setPrintError(null);
    try {
      const item = items.find((i) => i.id === id);
      await dispatchItemLabel(
        printerMode,
        id,
        count,
        codeAsText,
        `label-${item?.code ?? id}-x${count}.zpl`,
      );
      onItemsChanged();
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Print failed");
    }
  }

  /** Prints ZPL labels for all items in the current intake and notifies the
   *  parent to refresh. Dispatches on the workstation's label-printer setting. */
  async function handlePrintAll() {
    setPrintError(null);
    try {
      await dispatchIntakeLabels(
        printerMode,
        intakeId,
        codeAsText,
        `labels-intake-${intakeId}.zpl`,
      );
      onItemsChanged();
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Print failed");
    }
  }

  if (items.length === 0)
    return <p>No items yet. Add items using the form above.</p>;

  // Column totals: full-quantity value per line (price x quantity) summed
  // across the intake.
  const totalUnits = items.reduce((sum, it) => sum + it.quantity, 0);
  const totalOnHand = items.reduce((sum, it) => sum + it.remaining, 0);
  const totalPrice = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  return (
    <div>
      {deleteError && (
        <div role="alert" {...variantProps(v2, "ui2-items-error", ITEM_LIST.errorLine)}>
          {deleteError}
        </div>
      )}
      {donateError && (
        <div role="alert" {...variantProps(v2, "ui2-items-error", ITEM_LIST.errorLine)}>
          {donateError}
        </div>
      )}
      {printError && (
        <div role="alert" {...variantProps(v2, "ui2-items-error", ITEM_LIST.errorLine)}>
          {printError}
        </div>
      )}
      <div {...variantProps(v2, "ui2-items-header", ITEM_LIST.header)}>
        <h4 {...variantProps(v2, "ui2-items-title", ITEM_LIST.title)}>
          {items.length} item{items.length !== 1 ? "s" : ""}
        </h4>
        <div {...variantProps(v2, "ui2-items-actions", ITEM_LIST.headerActions)}>
          {/* Print the item code as text instead of a barcode — applies to
              every label printed from this list (per-item and bulk). */}
          {/* Label printer target: server-attached Zebra (default), this
              workstation via Zebra Browser Print, or a .zpl file download.
              Persisted per workstation (localStorage). */}
          <select
            aria-label="Label printer location"
            value={printerMode}
            onChange={(e) => {
              const mode = e.target.value as LabelPrinterMode;
              setPrinterMode(mode);
              setLabelPrinterMode(mode);
            }}
            {...variantProps(v2, "ui2-items-printer-select", ITEM_LIST.printerSelect)}
          >
            <option value="server">Print on server</option>
            <option value="agent">Print here (Browser Print agent)</option>
            <option value="download">Download .zpl file</option>
          </select>
          <label {...variantProps(v2, "ui2-items-code-toggle", ITEM_LIST.codeAsTextLabel)}>
            <input
              type="checkbox"
              checked={codeAsText}
              onChange={(e) => setCodeAsText(e.target.checked)}
              aria-label="Print item code as text instead of barcode"
            />
            Code as text (no barcode)
          </label>
          <button
            onClick={handlePrintAll}
            {...v1Only(v2, BUTTON_STYLE)}
            {...v2Only(v2, "ui2-btn ui2-btn--secondary")}
          >
            Print Labels for All Items
          </button>
        </div>
      </div>
      <TableScroll>
      <table
        {...variantProps(v2, "ui2-items-table", ITEM_LIST.table)}
      >
        <thead>
          <tr {...v1Only(v2, ITEM_LIST.headRow)}>
            <th {...v1Only(v2, ITEM_LIST.thLeft)}>Code</th>
            <th {...v1Only(v2, ITEM_LIST.thRight)}>Qty</th>
            <th {...v1Only(v2, ITEM_LIST.thLeft)}>Category</th>
            <th {...v1Only(v2, ITEM_LIST.thLeft)}>Type</th>
            <th {...v1Only(v2, ITEM_LIST.thLeft)}>Brand</th>
            <th {...v1Only(v2, ITEM_LIST.thLeft)}>
              Description
            </th>
            <th {...v1Only(v2, ITEM_LIST.thLeft)}>Size</th>
            <th {...v1Only(v2, ITEM_LIST.thRight)}>
              Sell Price
            </th>
            <th {...v1Only(v2, ITEM_LIST.thRight)}>
              Total Price
            </th>
            <th {...v1Only(v2, ITEM_LIST.thLeft)}>Donate?</th>
            <th {...v1Only(v2, ITEM_LIST.thRight)}>On Hand</th>
            <th {...v1Only(v2, ITEM_LIST.thLeft)}>Label</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <Fragment key={item.id}>
              <tr
                {...variantProps(
                  v2,
                  expandedEditId === item.id ? "ui2-items-row--open" : "",
                  ITEM_LIST.row(expandedEditId === item.id),
                )}
              >
                <td {...v1Only(v2, ITEM_LIST.cell)}>{item.code}</td>
                <td {...variantProps(v2, "ui2-num", ITEM_LIST.cellRight)}>
                  {item.quantity}
                </td>
                <td {...v1Only(v2, ITEM_LIST.cell)}>{item.category}</td>
                <td {...v1Only(v2, ITEM_LIST.cell)}>{item.type ?? "—"}</td>
                <td {...v1Only(v2, ITEM_LIST.cell)}>{item.brand ?? "—"}</td>
                <td {...v1Only(v2, ITEM_LIST.cell)}>
                  {item.description ?? "—"}
                </td>
                <td {...v1Only(v2, ITEM_LIST.cell)}>{item.size ?? "—"}</td>
                <td {...variantProps(v2, "ui2-num", ITEM_LIST.cellRight)}>
                  ${item.price.toFixed(2)}
                </td>
                <td {...variantProps(v2, "ui2-num", ITEM_LIST.cellRight)}>
                  ${(item.price * item.quantity).toFixed(2)}
                </td>
                <td {...v1Only(v2, ITEM_LIST.cell)}>
                  <input
                    type="checkbox"
                    aria-label={`Donate if unsold for ${item.code}`}
                    checked={item.donate_unsold}
                    disabled={donatePendingId === item.id}
                    onChange={() => void handleToggleDonate(item)}
                  />
                </td>
                <td {...variantProps(v2, "ui2-num", ITEM_LIST.cellRight)}>
                  {item.remaining}
                </td>
                <td {...v1Only(v2, ITEM_LIST.cell)}>
                  {item.label_printed ? "✓ printed" : "—"}
                </td>
                <td {...variantProps(v2, "ui2-items-nowrap ui2-items-actions", ITEM_LIST.cellNowrap)}>
                  {/* Print All Labels = one label per on-hand remaining unit.
                      Print N = an explicitly-specified number of labels. */}
                  <button
                    aria-label={`Print all labels for ${item.code}`}
                    onClick={() => void handlePrintOne(item.id)}
                    {...v1Only(v2, ITEM_LIST.rowButton)}{...v2Only(v2, "ui2-btn ui2-btn--secondary")}
                  >
                    Print All Labels
                  </button>
                  <input
                    aria-label={`Label count for ${item.code}`}
                    type="number"
                    min={1}
                    value={printQty[item.id] ?? ""}
                    onChange={(e) =>
                      setPrintQty((p) => ({ ...p, [item.id]: e.target.value }))
                    }
                    {...v1Only(v2, ITEM_LIST.printInput)}
                    {...v2Only(v2, "ui2-items-print-input")}
                  />
                  <button
                    aria-label={`Print the specified number of labels for ${item.code}`}
                    disabled={!(Number(printQty[item.id]) >= 1)}
                    onClick={() =>
                      void handlePrintCopies(
                        item.id,
                        Number(printQty[item.id] ?? 0),
                      )
                    }
                    {...v1Only(v2, ITEM_LIST.rowButton)}{...v2Only(v2, "ui2-btn ui2-btn--secondary")}
                  >
                    Print
                  </button>
                  <button
                    onClick={() => openEdit(item)}
                    {...v1Only(v2, ITEM_LIST.rowButton)}{...v2Only(v2, "ui2-btn ui2-btn--secondary")}
                  >
                    Edit
                  </button>
                  {/* Per-row Delete (tester feedback: "Not seeing a Delete button").
                      Same soft-delete guardrails as the edit-panel Delete. */}
                  <button
                    aria-label={`Delete ${item.code}`}
                    disabled={item.label_printed || item.status !== "available"}
                    title={
                      item.label_printed
                        ? "Cannot delete after labels are printed"
                        : item.status !== "available"
                          ? "Only available items can be deleted"
                          : `Delete item ${item.code}`
                    }
                    {...v1Only(v2, BUTTON_STYLE)}
                    {...v2Only(v2, "ui2-btn ui2-btn--secondary")}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete item ${item.code}? This cannot be undone.`,
                        )
                      )
                        void handleDelete(item.id);
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
              {expandedEditId === item.id && (
                <tr>
                  <td
                    colSpan={13}
                    {...variantProps(v2, "ui2-items-panel-cell", ITEM_LIST.panelCell)}
                  >
                    <div {...variantProps(v2, "ui2-items-edit-grid", ITEM_LIST.editGrid)}>
                      <div>
                        <label {...variantProps(v2, "ui2-items-edit-label", ITEM_LIST.editLabel)}>
                          Description
                        </label>
                        <input
                          value={draft.description}
                          maxLength={99}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              description: capitalizeWords(e.target.value),
                            }))
                          }
                          {...variantProps(v2, "ui2-items-edit-input", ITEM_LIST.editInput)}
                        />
                      </div>
                      <div>
                        <label {...variantProps(v2, "ui2-items-edit-label", ITEM_LIST.editLabel)}>
                          Price
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={draft.price}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, price: e.target.value }))
                          }
                          {...variantProps(v2, "ui2-items-edit-input", ITEM_LIST.editInput)}
                        />
                      </div>
                      <div>
                        <label {...variantProps(v2, "ui2-items-edit-label", ITEM_LIST.editLabel)}>
                          Brand
                        </label>
                        <input
                          value={draft.brand}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, brand: e.target.value }))
                          }
                          {...variantProps(v2, "ui2-items-edit-input", ITEM_LIST.editInput)}
                        />
                      </div>
                      <div>
                        <label {...variantProps(v2, "ui2-items-edit-label", ITEM_LIST.editLabel)}>
                          Category
                        </label>
                        <select
                          value={draft.category}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              category: e.target.value,
                              type: "",
                              size: "",
                            }))
                          }
                          {...variantProps(v2, "ui2-items-edit-input", ITEM_LIST.editInput)}
                        >
                          <option value="">— select —</option>
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label {...variantProps(v2, "ui2-items-edit-label", ITEM_LIST.editLabel)}>
                          Type
                        </label>
                        <select
                          value={draft.type}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              type: e.target.value,
                              size: d.type ? "" : d.size,
                            }))
                          }
                          {...variantProps(v2, "ui2-items-edit-input", ITEM_LIST.editInput)}
                        >
                          <option value="">— select type —</option>
                          {typesForCategory(draft.category).map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label {...variantProps(v2, "ui2-items-edit-label", ITEM_LIST.editLabel)}>
                          Size
                        </label>
                        {/* Free text: size scales vary per item (cm lengths,
                            Mondo boot sizes, US apparel sizes) — intake staff
                            type what is printed on the item. */}
                        <input
                          value={draft.size}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, size: e.target.value }))
                          }
                          placeholder="e.g. 170cm, 27.5, M"
                          {...variantProps(v2, "ui2-items-edit-input", ITEM_LIST.editInput)}
                        />
                      </div>
                    </div>
                    <div {...variantProps(v2, "ui2-items-note-row", ITEM_LIST.noteRow)}>
                      <span {...variantProps(v2, "ui2-items-note-text", ITEM_LIST.noteText)}>
                        On hand: <strong>{item.remaining}</strong> of{" "}
                        {item.quantity} intake
                        {item.quantity !== 1 ? " units" : " unit"}
                      </span>
                      {(() => {
                        // Live preview for the "= target" entry mode (#5):
                        // "=8" on 5 remaining shows "→ 8 on hand (+3)".
                        const raw = (qtyAdjust[item.id] ?? "").trim();
                        if (!raw.startsWith("=")) return null;
                        const target = parseInt(raw.slice(1), 10);
                        if (Number.isNaN(target)) return null;
                        return (
                          <span {...variantProps(v2, "ui2-items-note-preview", ITEM_LIST.notePreview)}>
                            → {target} on hand ({target - item.remaining >= 0 ? "+" : ""}
                            {target - item.remaining})
                          </span>
                        );
                      })()}
                      <label {...variantProps(v2, "ui2-items-note-text", ITEM_LIST.noteText)}>
                        Adjust by (or =target):
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`Adjust quantity for ${item.code}`}
                        value={qtyAdjust[item.id] ?? ""}
                        onChange={(e) =>
                          setQtyAdjust((p) => ({
                            ...p,
                            [item.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          // Enter applies directly (#5) — staff adjust on hand
                          // without reaching for the mouse.
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleAdjustQty(item.id, qtyAdjust[item.id] ?? "");
                          }
                        }}
                        placeholder="e.g. 3, -2, or =8"
                        {...variantProps(v2, "ui2-items-qty-input", ITEM_LIST.qtyInput)}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void handleAdjustQty(item.id, qtyAdjust[item.id] ?? "")
                        }
                        {...v1Only(v2, BUTTON_STYLE)}
                        {...v2Only(v2, "ui2-btn ui2-btn--secondary")}
                      >
                        Apply
                      </button>
                      {qtyError[item.id] && (
                        <span role="alert" {...variantProps(v2, "ui2-items-qty-error", ITEM_LIST.qtyError)}>
                          {qtyError[item.id]}
                        </span>
                      )}
                    </div>
                    {saveError && (
                      <p role="alert" {...variantProps(v2, "ui2-items-save-error", ITEM_LIST.saveError)}>
                        {saveError}
                      </p>
                    )}
                    <div {...variantProps(v2, "ui2-items-panel-actions", ITEM_LIST.actionRow)}>
                      <button
                        onClick={() => handleSave(item.id)}
                        disabled={saving}
                        style={v1Only(v2, ITEM_LIST.saveButton(saving)).style}
                        {...v2Only(v2, "ui2-btn ui2-btn--primary")}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setExpandedEditId(null)}
                        {...v1Only(v2, BUTTON_STYLE)}
                        {...v2Only(v2, "ui2-btn ui2-btn--secondary")}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={
                          item.label_printed || item.status !== "available"
                        }
                        title={
                          item.label_printed
                            ? "Cannot delete after labels are printed"
                            : item.status !== "available"
                              ? "Cannot delete an item that has been sold"
                              : ""
                        }
                        {...v1Only(v2, BUTTON_STYLE)}
                        {...v2Only(v2, "ui2-btn ui2-btn--danger ui2-items-panel-delete")}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr {...v1Only(v2, ITEM_LIST.footRow)}>
            <td {...v1Only(v2, ITEM_LIST.footCell)} />
            <td {...v1Only(v2, ITEM_LIST.footCellRight)}>{totalUnits}</td>
            <td colSpan={5} {...v1Only(v2, ITEM_LIST.footCellRight)}>
              Total — {items.length} item
              {items.length !== 1 ? "s" : ""}
            </td>
            <td />
            <td {...v1Only(v2, ITEM_LIST.footCellRight)}>
              ${totalPrice.toFixed(2)}
            </td>
            <td />
            <td {...v1Only(v2, ITEM_LIST.footCellRight)}>{totalOnHand}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
      </TableScroll>
    </div>
  );
}
