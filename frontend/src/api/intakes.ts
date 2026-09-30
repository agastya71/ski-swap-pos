/**
 * Intakes API — create and manage seller intake sessions and add items.
 * Requires admin or intake role.
 */
import { apiFetch, apiFetchText, getToken } from "./client";
import type {
 Intake,
 IntakeWithItems,
 IntakeCreate,
 IntakeUpdate,
 Item,
 ItemCreate,
 ImportResult,
} from "../types";

/**
 * Fetch all intake sessions for a given seller in the active event.
 *
 * @param sellerId - Primary key of the seller.
 * @returns Array of Intake records for that seller.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getSellerIntakes = (sellerId: number) =>
 apiFetch<Intake[]>(`/sellers/${sellerId}/intakes`);

/**
 * Create a new intake session for a seller.
 *
 * @param data - Seller ID and optional intake options (dates, donation flags).
 * @returns The newly created Intake record.
 * @throws {ApiError} 404 if the referenced seller does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const createIntake = (data: IntakeCreate) =>
 apiFetch<Intake>("/intakes", { method: "POST", body: JSON.stringify(data) });

/**
 * Fetch a single intake session with all its items eagerly loaded.
 *
 * @param id - Primary key of the intake to retrieve.
 * @returns The matching IntakeWithItems (intake metadata + items array).
 * @throws {ApiError} 404 if no intake with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getIntake = (id: number) =>
 apiFetch<IntakeWithItems>(`/intakes/${id}`);

/**
 * Update an intake session's donation flags or received date.
 *
 * @param id - Primary key of the intake to update.
 * @param data - Partial intake fields to update.
 * @returns The updated Intake record.
 * @throws {ApiError} 404 if no intake with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const updateIntake = (id: number, data: IntakeUpdate) =>
 apiFetch<Intake>(`/intakes/${id}`, {
  method: "PATCH",
  body: JSON.stringify(data),
 });

/**
 * Add a new item to an existing intake session.
 *
 * @param intakeId - Primary key of the intake to add the item to.
 * @param data - Item details including required code and price.
 * @returns The newly created Item record.
 * @throws {ApiError} 409 if an item with the same code already exists for this event.
 * @throws {ApiError} 404 if the referenced intake does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const addItem = (intakeId: number, data: ItemCreate) =>
 apiFetch<Item>(`/intakes/${intakeId}/items`, {
  method: "POST",
  body: JSON.stringify(data),
 });

/**
 * Send all unprinted item labels in an intake session to the ZPL label printer.
 *
 * @param intakeId - Primary key of the intake whose labels should be printed.
 * @param codeAsText - When true, each item's code prints as large text instead
 *   of a barcode (`?code_as_text=true`).
 * @returns Object with `intake_id` and `printed` count of labels sent to the printer.
 * @throws {ApiError} 404 if the referenced intake does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const printIntakeLabels = (intakeId: number, codeAsText?: boolean) =>
 apiFetch<{ intake_id: number; printed: number }>(
  `/intakes/${intakeId}/labels${codeAsText ? "?code_as_text=true" : ""}`,
  { method: "POST" },
 );

/**
 * Fetch the concatenated raw ZPL for all items in an intake WITHOUT sending
 * it to the server-attached printer (client-side printing path).
 *
 * Used when the Zebra is attached to the browser workstation: the caller hands
 * this ZPL to the local printer (e.g. the Zebra Browser Print agent) or saves
 * it as a download, then calls {@link ackIntakeLabels} after a successful
 * local print. Label-for-label identical to the server-attached POST flow.
 *
 * @param intakeId - Primary key of the intake whose labels should be rendered.
 * @param codeAsText - When true, each item's code prints as large text instead
 *   of a barcode (`?code_as_text=true`).
 * @returns The concatenated ZPL II text (`text/plain`).
 * @throws {ApiError} 404 if the referenced intake does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const fetchIntakeLabelsZpl = (intakeId: number, codeAsText?: boolean) =>
 apiFetchText(
  `/intakes/${intakeId}/labels.zpl${codeAsText ? "?code_as_text=true" : ""}`,
 );

/**
 * Mark every item in the intake as label-printed after a successful
 * client-side local print (idempotent bulk companion of the item-level ack).
 *
 * @param intakeId - Primary key of the intake whose labels were printed.
 * @returns Object with `intake_id` and `acknowledged` item count.
 * @throws {ApiError} 404 if the referenced intake does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const ackIntakeLabels = (intakeId: number) =>
 apiFetch<{ intake_id: number; acknowledged: number }>(
  `/intakes/${intakeId}/labels-ack`,
  { method: "POST" },
 );

/**
 * Bulk-import items into an intake session from an Excel file.
 *
 * @param intakeId - Primary key of the intake to import into.
 * @param file - The .xlsx file using the standard import template.
 * @returns Import summary with counts and any row-level errors.
 */
export async function importItems(
 intakeId: number,
 file: File,
): Promise<ImportResult> {
 const form = new FormData();
 form.append("file", file);
 // Use raw fetch — apiFetch serialises JSON; multipart requires FormData
 const token = getToken();
 const res = await fetch(`/intakes/${intakeId}/items/import`, {
  method: "POST",
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  body: form,
 });
 if (!res.ok) throw new Error(`Import failed: ${res.statusText}`);
 return res.json() as Promise<ImportResult>;
}
