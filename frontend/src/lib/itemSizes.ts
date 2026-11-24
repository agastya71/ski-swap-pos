export const ITEM_TYPES: string[] = [
  "Alpine Ski",
  "Snowboard",
  "Nordic/XC Ski",
  "Skate",
  "Classic",
  "Combi",
  "Touring",
  "Ski Boot",
  "Snowboard Boot",
  "Ski Pole",
  "Helmet",
  "Goggles",
  "Hat",
  "Head band",
  "Jacket",
  "Pants",
  "Ski Pants",
  "Ski suit",
  "Base Layer",
  "Base Layer Top",
  "Base Layer Bottom",
  "Gloves",
  "Other",
];

/** Merchandise categories offered at intake. Mirrors the backend's canonical
 *  list (app/services/canonical.py) so imports and manual entry agree.
 *  Category renames (event feedback #11, 2026-11-24): the "Ski" prefix was
 *  dropped — Ski Boots→Boots, Ski Poles→Poles, Ski Jacket→Jacket,
 *  Ski Pants→Pants; "Ski" itself folded into "Skis". Old spellings are
 *  rewritten in the data by the bootstrap repair and stay accepted as typed
 *  aliases in the backend (legacy rows read/write transparently). */
export const CATEGORIES: string[] = [
  "Skis",
  "Boots",
  "Poles",
  "Snowboard",
  "Snowboard Boots",
  "Bindings",
  "Helmet",
  "Clothing",
  "Other",
];

/** Item types offered per category ("Types are dependent on Category").
 *  Skis includes the XC disciplines (Skate/Classic) per tester request;
 *  categories without a mapping or unknown categories fall back to the full
 *  list. Unknown type values are never rejected elsewhere — this shapes
 *  choice, not validation. */
export const CATEGORY_TYPES: Partial<Record<string, string[]>> = {
  Skis: ["Classic", "Skate", "Combi", "Other"],
  Boots: ["Classic", "Skate", "Combi", "Touring", "Other"],
  Poles: ["Ski Pole"],
  Snowboard: ["Snowboard"],
  "Snowboard Boots": ["Snowboard Boot"],
  Helmet: ["Helmet"],
  Clothing: [
    "Base Layer Bottom",
    "Base Layer Top",
    "Gloves",
    "Hat",
    "Head band",
    "Jacket",
    "Ski Pants",
    "Ski suit",
  ],
};

/** Types to offer for a category: the category's mapped list (plus 'Other'),
 *  or the full list when no category is chosen, unmapped, or unknown. */
export function typesForCategory(
  category: string | null | undefined,
): string[] {
  const mapped = category ? CATEGORY_TYPES[category] : undefined;
  if (!mapped || mapped.length === 0) return ITEM_TYPES;
  return mapped.includes("Other") ? mapped : [...mapped, "Other"];
}
