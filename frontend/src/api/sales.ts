/**
 * Sales API — create, fetch, edit (line add/update/remove + payment/info), list,
 * and void point-of-sale transactions. Requires cashier or admin role;
 * non-admins may edit only their own sales (enforced server-side).
 */
import { apiFetch } from "./client";
import type {
 SaleCreate,
 SaleEditResponse,
 SaleItemCreate,
 SaleLineEdit,
 SaleUpdate,
 SaleWithItemsResponse,
} from "../types";

/**
 * Create a new sale transaction.
 * Marks all included items as sold and calculates commission splits.
 *
 * @param data - Items, payment amounts, and optional customer details.
 * @returns The completed SaleWithItemsResponse including all line items and totals.
 * @throws {ApiError} 409 if any included item is not in 'available' status.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const createSale = (data: SaleCreate) =>
 apiFetch<SaleWithItemsResponse>("/sales", {
  method: "POST",
  body: JSON.stringify(data),
 });

/**
 * Fetch a completed sale by primary key.
 *
 * @param id - Primary key of the sale to retrieve.
 * @returns The SaleWithItemsResponse including all line items.
 * @throws {ApiError} 404 if no sale with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getSale = (id: number) =>
 apiFetch<SaleWithItemsResponse>(`/sales/${id}`);

/**
 * Fetch the caller's own sales for the active event, newest first, with all
 * line items — read-only self-service transaction history for the cashier.
 *
 * @returns Array of SaleWithItemsResponse (may be empty).
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const fetchMySales = () =>
 apiFetch<SaleWithItemsResponse[]>("/sales/mine");

/**
 * Void a sale, returning all its line items to 'available' status so they can be re-sold.
 *
 * @param id - Primary key of the sale to void.
 * @returns The updated SaleWithItemsResponse with `is_voided: true`.
 * @throws {ApiError} 404 if no sale with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const voidSale = (id: number) =>
 apiFetch<SaleWithItemsResponse>(`/sales/${id}/void`, { method: "POST" });

/**
 * Correct a completed sale's payment tender and/or customer info fields.
 * Omitted fields are unchanged; total_paid / balance_due are recomputed.
 *
 * @param id - Primary key of the sale to edit (must be the caller's own unless admin).
 * @param data - Replacement payment/customer fields.
 * @returns The updated SaleWithItemsResponse with all line items.
 * @throws {ApiError} 404 unknown sale · 409 already voided · 403 non-admin editing another cashier's sale.
 */
export const editSale = (id: number, data: SaleUpdate) =>
 apiFetch<SaleWithItemsResponse>(`/sales/${id}`, {
   method: "PATCH",
   body: JSON.stringify(data),
 });

/**
 * Append a line item to a completed sale (stock- and duplicate-checked like
 * checkout; the item's remaining units are decremented).
 *
 * @returns The updated SaleWithItemsResponse with the new line appended.
 * @throws {ApiError} 404 unknown sale/item · 409 voided · 403 non-admin foreign sale ·
 *   422 duplicate item / insufficient remaining stock.
 */
export const addSaleLine = (saleId: number, line: SaleItemCreate) =>
 apiFetch<SaleWithItemsResponse>(`/sales/${saleId}/lines`, {
   method: "POST",
   body: JSON.stringify(line),
 });

/**
 * Change one completed sale line's quantity / sell_price / notes; stock moves
 * in/out of the item's remaining units and totals are recomputed.
 *
 * @returns The updated SaleWithItemsResponse.
 * @throws {ApiError} 404 unknown sale/line · 409 voided · 403 foreign sale ·
 *   422 stock/invariant violations (e.g. cannot raise qty beyond remaining).
 */
export const editSaleLine = (saleId: number, saleItemId: number, patch: SaleLineEdit) =>
 apiFetch<SaleWithItemsResponse>(`/sales/${saleId}/lines/${saleItemId}`, {
   method: "PATCH",
   body: JSON.stringify(patch),
 });

/**
 * Remove one line from a completed sale: its units return to the item's
 * remaining stock; the removed line is preserved in the sale's audit history.
 * A sale always keeps at least one line — void it instead.
 *
 * @returns The updated SaleWithItemsResponse (lines renumbered, totals recomputed).
 */
export const removeSaleLine = (saleId: number, saleItemId: number) =>
 apiFetch<SaleWithItemsResponse>(`/sales/${saleId}/lines/${saleItemId}`, {
   method: "DELETE",
 });

/**
 * Fetch the sale's audit history (newest first): who/when changed what.
 * Read-only — remains viewable even for voided sales.
 */
export const fetchSaleEdits = (saleId: number) =>
 apiFetch<SaleEditResponse[]>(`/sales/${saleId}/edits`);

/**
 * Admin: list the active event's sales, newest first, for the transactions
 * page. Paginated; filterable by cashier; voided sales excluded unless
 * `includeVoided` is set.
 */
export const listSales = (params?: {
 limit?: number;
 offset?: number;
 created_by?: string;
 include_voided?: boolean;
}) => {
 const query = params
   ? "?" +
     Object.entries(params)
       .filter(([, v]) => v !== undefined && v !== "")
       .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
       .join("&")
   : "";
 return apiFetch<SaleWithItemsResponse[]>(`/sales${query}`);
};
