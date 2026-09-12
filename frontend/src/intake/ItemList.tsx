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
  printLabel,
  updateItem,
} from "../api/items";
import { BUTTON_STYLE } from "../lib/buttons";
import { printIntakeLabels } from "../api/intakes";
import { ITEM_TYPES, SIZE_OPTIONS } from "../lib/itemSizes";
import type { Item, ItemUpdate } from "../types";

const GENDER_AGE_OPTIONS = ["Adult", "Youth", "Toddler", "Unisex"];

/**
 * Renders a tabular list of items belonging to a single intake session.
 * Provides per-item Edit panel (description, price, brand, size, color), Print Label,
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
    description: "",
    price: "",
    brand: "",
    type: "",
    size: "",
    gender_age: "",
    color: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [qtyAdjust, setQtyAdjust] = useState("");
  const [qtyError, setQtyError] = useState<string | null>(null);
  // Per-row label-print counts ("print a specified number of labels per item").
  const [printQty, setPrintQty] = useState<Record<number, string>>({});
  const [printError, setPrintError] = useState<string | null>(null);

  /** Opens the edit panel for the given item, or closes it if already open. */
  function openEdit(item: Item) {
    if (expandedEditId === item.id) {
      setExpandedEditId(null);
      return;
    }
    setExpandedEditId(item.id);
    setDraft({
      description: item.description ?? "",
      price: String(item.price),
      brand: item.brand ?? "",
      type: item.type ?? "",
      size: item.size ?? "",
      gender_age: item.gender_age ?? "",
      color: item.color ?? "",
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

  /** Adjusts the item's on-hand quantity by a signed delta and refreshes. */
  async function handleAdjustQty(itemId: number) {
    const delta = parseInt(qtyAdjust, 10);
    if (Number.isNaN(delta) || delta === 0) return;
    setQtyError(null);
    try {
      await adjustItemQuantity(itemId, delta);
      setQtyAdjust("");
      onItemsChanged();
    } catch (err) {
      setQtyError(
        err instanceof Error ? err.message : "Failed to adjust quantity",
      );
    }
  }

  /** PATCHes the item with only the fields that changed, closes the panel, and notifies the parent. */
  async function handleSave(itemId: number) {
    setSaving(true);
    setSaveError(null);
    try {
      const original = items.find((i) => i.id === itemId)!;
      const update: Record<string, string | number> = {};
      if (draft.description !== (original.description ?? ""))
        update.description = draft.description;
      if (parseFloat(draft.price) !== original.price)
        update.price = parseFloat(draft.price);
      if (draft.brand !== (original.brand ?? "")) update.brand = draft.brand;
      if (draft.type !== (original.type ?? "")) update.type = draft.type;
      if (draft.size !== (original.size ?? "")) update.size = draft.size;
      if (draft.gender_age !== (original.gender_age ?? ""))
        update.gender_age = draft.gender_age;
      if (draft.color !== (original.color ?? "")) update.color = draft.color;
      await updateItem(itemId, update as ItemUpdate);
      setExpandedEditId(null);
      onItemsChanged();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  /** Prints labels for every remaining unit of a single item ("all labels per item"). */
  async function handlePrintOne(id: number) {
    setPrintError(null);
    try {
      await printLabel(id);
      onItemsChanged();
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Print failed");
    }
  }

  /** Prints an explicitly-specified number of labels for a single item. */
  async function handlePrintCopies(id: number, count: number) {
    setPrintError(null);
    try {
      await printLabel(id, count);
      onItemsChanged();
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Print failed");
    }
  }

  /** Prints ZPL labels for all items in the current intake and notifies the parent to refresh. */
  async function handlePrintAll() {
    setPrintError(null);
    try {
      await printIntakeLabels(intakeId);
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
        <div role="alert" style={{ color: "red", marginBottom: 8 }}>
          {deleteError}
        </div>
      )}
      {printError && (
        <div role="alert" style={{ color: "red", marginBottom: 8 }}>
          {printError}
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <h4 style={{ margin: 0 }}>
          {items.length} item{items.length !== 1 ? "s" : ""}
        </h4>
        <button onClick={handlePrintAll} style={BUTTON_STYLE}>
          Print Labels for All Items
        </button>
      </div>
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
      >
        <thead>
          <tr style={{ borderBottom: "2px solid #ccc" }}>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Code</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Category</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>
              Description
            </th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>Price</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>Qty</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>
              Total Price
            </th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>On Hand</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Label</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <Fragment key={item.id}>
              <tr
                style={{
                  borderBottom:
                    expandedEditId === item.id ? "none" : "1px solid #eee",
                }}
              >
                <td style={{ padding: "4px 8px" }}>{item.code}</td>
                <td style={{ padding: "4px 8px" }}>{item.category}</td>
                <td style={{ padding: "4px 8px" }}>
                  {[item.brand, item.description].filter(Boolean).join(" — ") ||
                    "—"}
                </td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>
                  ${item.price.toFixed(2)}
                </td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>
                  {item.quantity}
                </td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>
                  ${(item.price * item.quantity).toFixed(2)}
                </td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>
                  {item.remaining}
                </td>
                <td style={{ padding: "4px 8px" }}>
                  {item.label_printed ? "✓ printed" : "—"}
                </td>
                <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>
                  {/* Print All Labels = one label per on-hand remaining unit.
                      Print N = an explicitly-specified number of labels. */}
                  <button
                    aria-label={`Print all labels for ${item.code}`}
                    onClick={() => void handlePrintOne(item.id)}
                    style={{ ...BUTTON_STYLE, marginRight: 4 }}
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
                    style={{ width: 52, marginRight: 2 }}
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
                    style={{ ...BUTTON_STYLE, marginRight: 4 }}
                  >
                    Print
                  </button>
                  <button
                    onClick={() => openEdit(item)}
                    style={{ ...BUTTON_STYLE, marginRight: 4 }}
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
                    style={BUTTON_STYLE}
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
                    colSpan={7}
                    style={{
                      padding: "8px 16px 16px",
                      background: "#f8fafc",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            color: "#64748b",
                            marginBottom: 2,
                          }}
                        >
                          Description
                        </label>
                        <input
                          value={draft.description}
                          maxLength={99}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              description: e.target.value,
                            }))
                          }
                          style={{
                            width: "100%",
                            padding: "4px 6px",
                            boxSizing: "border-box",
                            fontSize: 13,
                          }}
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            color: "#64748b",
                            marginBottom: 2,
                          }}
                        >
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
                          style={{
                            width: "100%",
                            padding: "4px 6px",
                            boxSizing: "border-box",
                            fontSize: 13,
                          }}
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            color: "#64748b",
                            marginBottom: 2,
                          }}
                        >
                          Brand
                        </label>
                        <input
                          value={draft.brand}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, brand: e.target.value }))
                          }
                          style={{
                            width: "100%",
                            padding: "4px 6px",
                            boxSizing: "border-box",
                            fontSize: 13,
                          }}
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            color: "#64748b",
                            marginBottom: 2,
                          }}
                        >
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
                          style={{
                            width: "100%",
                            padding: "4px 6px",
                            boxSizing: "border-box",
                            fontSize: 13,
                          }}
                        >
                          <option value="">— select type —</option>
                          {ITEM_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            color: "#64748b",
                            marginBottom: 2,
                          }}
                        >
                          Size
                        </label>
                        {SIZE_OPTIONS[draft.type] ? (
                          <select
                            value={draft.size}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, size: e.target.value }))
                            }
                            style={{
                              width: "100%",
                              padding: "4px 6px",
                              boxSizing: "border-box",
                              fontSize: 13,
                            }}
                          >
                            <option value="">— select size —</option>
                            {SIZE_OPTIONS[draft.type].map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={draft.size}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, size: e.target.value }))
                            }
                            style={{
                              width: "100%",
                              padding: "4px 6px",
                              boxSizing: "border-box",
                              fontSize: 13,
                            }}
                          />
                        )}
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            color: "#64748b",
                            marginBottom: 2,
                          }}
                        >
                          Gender/Age
                        </label>
                        <select
                          value={draft.gender_age}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              gender_age: e.target.value,
                            }))
                          }
                          style={{
                            width: "100%",
                            padding: "4px 6px",
                            boxSizing: "border-box",
                            fontSize: 13,
                          }}
                        >
                          <option value="">— select —</option>
                          {GENDER_AGE_OPTIONS.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            color: "#64748b",
                            marginBottom: 2,
                          }}
                        >
                          Color
                        </label>
                        <input
                          value={draft.color}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, color: e.target.value }))
                          }
                          style={{
                            width: "100%",
                            padding: "4px 6px",
                            boxSizing: "border-box",
                            fontSize: 13,
                          }}
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: "#64748b" }}>
                        On hand: <strong>{item.remaining}</strong> of{" "}
                        {item.quantity} intake
                        {item.quantity !== 1 ? " units" : " unit"}
                      </span>
                      <label style={{ color: "#64748b" }}>Adjust by:</label>
                      <input
                        type="number"
                        value={qtyAdjust}
                        onChange={(e) => setQtyAdjust(e.target.value)}
                        placeholder="e.g. 3 or -2"
                        style={{ width: 90, padding: "4px 6px", fontSize: 13 }}
                      />
                      <button
                        type="button"
                        onClick={() => handleAdjustQty(item.id)}
                        style={BUTTON_STYLE}
                      >
                        Apply
                      </button>
                      {qtyError && (
                        <span role="alert" style={{ color: "#ef4444" }}>
                          {qtyError}
                        </span>
                      )}
                    </div>
                    {saveError && (
                      <p
                        role="alert"
                        style={{
                          color: "#ef4444",
                          fontSize: 12,
                          margin: "0 0 8px",
                        }}
                      >
                        {saveError}
                      </p>
                    )}
                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <button
                        onClick={() => handleSave(item.id)}
                        disabled={saving}
                        style={{
                          ...BUTTON_STYLE,
                          cursor: saving ? "default" : "pointer",
                        }}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setExpandedEditId(null)}
                        style={BUTTON_STYLE}
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
                        style={{
                          ...BUTTON_STYLE,
                          marginLeft: "auto",
                        }}
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
          <tr
            style={{
              borderTop: "2px solid #333",
              fontWeight: "bold",
              background: "#f8fafc",
            }}
          >
            <td colSpan={3} style={{ padding: "6px 8px", textAlign: "right" }}>
              Total — {items.length} item
              {items.length !== 1 ? "s" : ""}
            </td>
            <td />
            <td style={{ padding: "6px 8px", textAlign: "right" }}>
              {totalUnits}
            </td>
            <td style={{ padding: "6px 8px", textAlign: "right" }}>
              ${totalPrice.toFixed(2)}
            </td>
            <td style={{ padding: "6px 8px", textAlign: "right" }}>
              {totalOnHand}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
