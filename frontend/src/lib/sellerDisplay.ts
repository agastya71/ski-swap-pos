/**
 * Shared seller display helpers — vendor-aware naming + the Vendor/Individual
 * type label, used everywhere a seller is surfaced (search results, intake
 * breadcrumb, intake header, seller detail).
 *
 * @module sellerDisplay
 */
import type { Seller } from "../types";

/** Vendor/Individual label for a seller. */
export function sellerTypeLabel(
  s: Pick<Seller, "is_vendor">,
): "Vendor" | "Individual" {
  return s.is_vendor ? "Vendor" : "Individual";
}

/** Display name: company for vendors (they are never a person), person name
 *  for individuals (falling back to the code when both names are absent). */
export function sellerDisplayName(
  s: Pick<Seller, "first_name" | "last_name" | "company" | "is_vendor" | "code">,
): string {
  if (s.is_vendor) return s.company ?? s.code;
  return [s.first_name, s.last_name].filter(Boolean).join(" ") || s.code;
}