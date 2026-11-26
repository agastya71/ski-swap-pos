/*
 * A/B variant routing for the UI overhaul (docs/ui-overhaul-ab-plan-2026-11-24.md).
 *
 * One bundle serves both variants: the variant is chosen once at boot from the
 * URL (?ui=v2 / ?ui=v1 — BEFORE the hash, we are a hash-router app), persisted
 * to localStorage["ui-variant"], and applied as:
 *   - <html class="ui-v2">  → v2 CSS token overrides in index.css
 *   - a React context (useUiVariant()) for the rare structural differences
 *
 * Default is v2 since the U6 promotion (docs/ui-overhaul-ab-plan-2026-11-24.md
 * "U6 verdict"). Staff who want the pre-overhaul look use ?ui=v1, which is
 * written through to storage exactly like ?ui=v2 was — so the escape hatch
 * persists, and a plain URL keeps the stored choice either way.
 */

import { createContext, useContext } from "react";

export type UiVariant = "v1" | "v2";

const STORAGE_KEY = "ui-variant";

export const UI_VARIANTS: readonly UiVariant[] = ["v1", "v2"];

/** Read the variant from a URL search string ("" when absent). */
export function variantFromSearch(search: string): UiVariant | null {
  const params = new URLSearchParams(search);
  const raw = params.get("ui");
  if (raw === "v2") return "v2";
  if (raw === "v1") return "v1";
  return null;
}

/** Read the persisted variant (invalid/absent values → null). */
export function storedVariant(storage: Storage | null = typeof localStorage === "undefined" ? null : localStorage): UiVariant | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === "v2") return "v2";
    if (raw === "v1") return "v1";
    return null;
  } catch {
    return null; // private mode / storage denied → default
  }
}

/**
 * Boot-time variant resolution: URL wins over storage; a valid URL value is
 * written through to storage so plain URLs keep the choice. Nothing else
 * writes the key, so a stored ?ui=v1 always wins over the default.
 */
export const DEFAULT_UI_VARIANT: UiVariant = "v2";

export function resolveUiVariant(search: string, storage: Storage | null = typeof localStorage === "undefined" ? null : localStorage): UiVariant {
  const fromUrl = variantFromSearch(search);
  if (fromUrl) {
    try {
      storage?.setItem(STORAGE_KEY, fromUrl);
    } catch {
      /* storage unavailable — URL still honored for this load */
    }
    return fromUrl;
  }
  return storedVariant(storage) ?? DEFAULT_UI_VARIANT;
}

/** Clear the persisted variant (used by tests and the ?ui=v1 switch). */
export function clearUiVariant(storage: Storage | null = typeof localStorage === "undefined" ? null : localStorage): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** React side: context set once in main.tsx; consumers use the hook. */
export const UiVariantContext = createContext<UiVariant>(DEFAULT_UI_VARIANT);

export function useUiVariant(): UiVariant {
  return useContext(UiVariantContext);
}

/** Root class applied to <html> at boot so CSS can target the v2 tokens. */
export function applyVariantRootClass(variant: UiVariant): void {
  const root = document.documentElement;
  root.classList.toggle("ui-v2", variant === "v2");
}
