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
 *  list (app/services/canonical.py) so imports and manual entry agree. */
export const CATEGORIES: string[] = [
  "Skis",
  "Ski Boots",
  "Ski Poles",
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
  "Ski Boots": ["Classic", "Skate", "Combi", "Touring", "Other"],
  "Ski Poles": ["Ski Pole"],
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
