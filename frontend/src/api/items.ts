/**
 * Items API — fetch, update, delete, and look up individual consignment items.
 * Lookup and search are available to all roles; write operations require admin or intake.
 */
import { apiFetch, getToken } from "./client";
import type {
   Item,
   ItemUpdate,
   ItemLookupResponse,
   ItemSearchResult,
   WorksheetImportResult,
} from "../types";

/**
 * Import a seller worksheet (seller-info block + item table) for the active
 * event. Finds or creates the seller (deduplicated by name/email/phone),
 * reuses or creates the seller's intake, and imports the item rows.
 *
 * @param file - The .xlsx worksheet using the enriched import template.
 * @returns Worksheet summary: seller created/matched, intake, item counts, errors.
 * @throws {ApiError} 422 if the seller block is missing/ambiguous or rows are invalid.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export async function importWorksheet(file: File): Promise<WorksheetImportResult> {
   const form = new FormData();
   form.append("file", file);
   // Use raw fetch — apiFetch serialises JSON; multipart requires FormData.
   const token = getToken();
   const res = await fetch("/items/import-worksheet", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
   });
   if (!res.ok) {
      // Surface the backend's validation detail (e.g. ambiguous-seller guidance).
      let detail: string | null = null;
      try {
         const body = await res.json();
         detail = body?.detail ?? null;
      } catch {
         /* non-JSON error body — fall back to statusText */
      }
      throw new Error(detail || `Worksheet import failed: ${res.statusText}`);
   }
   return res.json();
}

/**
 * Fetch a single item by primary key.
 *
 * @param id - Primary key of the item to retrieve.
 * @returns The matching Item record.
 * @throws {ApiError} 404 if no item with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getItem = (id: number) => apiFetch<Item>(`/items/${id}`);

/**
 * Update an existing item's fields.
 *
 * @param id - Primary key of the item to update.
 * @param data - Partial item fields to update.
 * @returns The updated Item record.
 * @throws {ApiError} 404 if no item with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const updateItem = (id: number, data: ItemUpdate) =>
   apiFetch<Item>(`/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
   });

/**
 * Permanently delete an item record.
 * Only permitted for items that have not been sold.
 *
 * @param id - Primary key of the item to delete.
 * @throws {ApiError} 409 if the item has already been sold.
 * @throws {ApiError} 404 if no item with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const deleteItem = (id: number) =>
   apiFetch<void>(`/items/${id}`, { method: "DELETE" });

/**
 * Adjust an item's on-hand quantity by a signed delta.
 *
 * Positive values increase the quantity by the difference; negative values
 * decrease it (the resulting quantity may not go below zero, i.e. fewer total
 * units than already sold).
 *
 * @param id - Primary key of the item to adjust.
 * @param adjustment - Signed integer to add to (or subtract from) the quantity.
 * @returns The updated Item record.
 * @throws {ApiError} 422 if the adjustment would reduce quantity below zero.
 * @throws {ApiError} 404 if no item with the given ID exists.
 */
export const adjustItemQuantity = (id: number, adjustment: number) =>
   apiFetch<Item>(`/items/${id}/quantity`, {
      method: "PATCH",
      body: JSON.stringify({ adjustment }),
   });

/**
 * Fetch distinct brand names for the active event, optionally filtered by prefix.
 * Used by the item-entry brand typeahead to suggest close alternatives.
 *
 * @param q - Partial brand string to filter by (case-insensitive).
 * @returns Array of matching brand names; may be empty.
 * @throws {ApiError} 401 if the session token is invalid.
 */
/**
 * Fetch brand-typeahead suggestions for the active event.
 *
 * @param q - Partial brand string to filter by (case-insensitive).
 * @param category - When provided (e.g. 'Skis'), only brands that have been
 *   assigned to items in that category are returned.
 * @returns Array of matching brand names; may be empty.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const fetchBrands = (q: string, category?: string) => {
   const params = new URLSearchParams({ q });
   if (category) params.set("category", category);
   return apiFetch<string[]>(`/items/brands?${params.toString()}`);
};

/**
 * Send a ZPL label for one item to the label printer.
 *
 * @param id - Primary key of the item whose label should be printed.
 * @param copies - Optional explicit number of labels to print. When omitted,
 *   the label prints one copy per on-hand remaining unit (one tag per unit).
 * @param codeAsText - When true, the item code prints as large text instead
 *   of a barcode (`?code_as_text=true`); details are otherwise unchanged.
 * @returns The updated Item record with `label_printed: true`.
 * @throws {ApiError} 404 if no item with the given ID exists.
 * @throws {ApiError} 422 if `copies` is provided and less than 1.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const printLabel = (
   id: number,
   copies?: number,
   codeAsText?: boolean,
) => {
   const params = new URLSearchParams();
   if (copies) params.set("copies", String(copies));
   if (codeAsText) params.set("code_as_text", "true");
   const qs = params.toString();
   return apiFetch<Item>(`/items/${id}/label${qs ? `?${qs}` : ""}`, {
      method: "POST",
   });
};

/**
 * Exact-match item lookup by code — the fast path for barcode scanners.
 *
 * @param code - Exact item code to look up, e.g. "A001-003".
 * @returns The matching ItemLookupResponse (item fields + seller_code).
 * @throws {ApiError} 404 if no item with that exact code exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const lookupItem = (code: string) =>
   apiFetch<ItemLookupResponse>(
      `/items/lookup?code=${encodeURIComponent(code)}`,
   );

/**
 * Partial-match item search — autocomplete path for manual code entry.
 * Returns items whose code, description, or category contain the query string.
 *
 * @param q - Search string (partial code, description, or category).
 * @returns Array of matching ItemLookupResponse records; may be empty.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const searchItems = (q: string) =>
   apiFetch<ItemLookupResponse[]>(`/items/search?q=${encodeURIComponent(q)}`);

/**
 * Trigger a download of the blank Excel import template.
 * Opens the file in the browser's native download handler.
 * @throws {Error} if the request fails or the server returns a non-OK status.
 */
export function downloadImportTemplate(): Promise<void> {
   const token = getToken();
   return fetch("/items/import-template", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
   })
      .then(async (r) => {
         if (!r.ok)
            throw new Error(`Template download failed: ${r.statusText}`);
         const buf = await r.arrayBuffer();
         return new Blob([buf], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
         });
      })
      .then((blob) => {
         const url = URL.createObjectURL(blob);
         const link = document.createElement("a");
         link.href = url;
         link.download = "import-template.xlsx";
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
         setTimeout(() => URL.revokeObjectURL(url), 5000);
      });
}

/**
 * Full-field search across ALL intake items for the active event. Matches
 * (case-insensitive) on item code, description, category, brand, type, color,
 * size, gender/age, barcode, status, year, price, quantity, remaining, and the
 * seller's code/name/company. Empty `q` lists all items (bounded by the server).
 *
 * @param q - Search string matched against every field.
 * @param status - Optional lifecycle status filter (available/sold/donated/returned).
 * @returns Array of matching ItemSearchResult records; may be empty.
 * @throws {ApiError} 401 if the session token is invalid; 403 for cashier role.
 */
export const searchIntakeItems = (q: string, status = "") => {
   const params = new URLSearchParams({ q });
   if (status) params.set("status", status);
   return apiFetch<ItemSearchResult[]>(
      `/items/intake-search?${params.toString()}`,
   );
};

/**
 * Download an Excel export of the current intake-item search results (same
 * filters as {@link searchIntakeItems}). Mirrors {@link downloadImportTemplate}:
 * fetch → Blob → synthetic <a> click.
 *
 * @param q - Search string matched against every field.
 * @param status - Optional lifecycle status filter.
 * @param filename - Download filename (defaults to the server-suggested name).
 * @throws {Error} if the request fails or the server returns a non-OK status.
 */
export function exportIntakeSearch(
   q: string,
   status = "",
   filename?: string,
): Promise<void> {
   const token = getToken();
   const params = new URLSearchParams({ q });
   if (status) params.set("status", status);
   return fetch(`/items/intake-search/export?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
   })
      .then(async (r) => {
         if (!r.ok) throw new Error(`Export download failed: ${r.statusText}`);
         const buf = await r.arrayBuffer();
         return new Blob([buf], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
         });
      })
      .then((blob) => {
         const url = URL.createObjectURL(blob);
         const link = document.createElement("a");
         link.href = url;
         link.download = filename || "intake-items-export.xlsx";
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
         setTimeout(() => URL.revokeObjectURL(url), 5000);
      });
}
