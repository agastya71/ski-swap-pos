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

function cmRange(start: number, end: number, step: number): string[] {
  const out: string[] = [];
  for (let n = start; n <= end; n += step) out.push(`${n}cm`);
  return out;
}

function mondoRange(startTenths: number, endTenths: number): string[] {
  const out: string[] = [];
  for (let n = startTenths; n <= endTenths; n += 5) {
    out.push(`${(n / 10).toFixed(1)} (Mondo)`);
  }
  return out;
}

export const SIZE_OPTIONS: Record<string, string[]> = {
  "Alpine Ski": cmRange(70, 210, 5),
  Snowboard: cmRange(70, 175, 5),
  "Nordic/XC Ski": cmRange(90, 215, 5),
  Skate: cmRange(140, 215, 5),
  Classic: cmRange(140, 210, 5),
  Combi: cmRange(140, 215, 5),
  "Ski Pole": cmRange(70, 140, 5),
  "Ski Boot": mondoRange(150, 330),
  // Nordic boot disciplines (Ski Boots category) share the Ski Boot mondo
  // scale — keyed by "Category:Type" so they don't collide with the same-named
  // ski types (whose sizes are lengths in cm).
  "Ski Boots:Classic": mondoRange(150, 330),
  "Ski Boots:Skate": mondoRange(150, 330),
  "Ski Boots:Combi": mondoRange(150, 330),
  "Ski Boots:Touring": mondoRange(150, 330),
  "Snowboard Boot": [
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
  ],
  Helmet: ["XS", "S", "M", "L", "XL", "XXL"],
  Goggles: ["Youth", "One Size", "S", "M", "L"],
  Jacket: [
    "4",
    "6",
    "8",
    "10",
    "12",
    "14",
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "XXL",
    "XXXL",
  ],
  Pants: [
    "4",
    "6",
    "8",
    "10",
    "12",
    "14",
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "XXL",
    "XXXL",
  ],
  "Ski Pants": [
    "4",
    "6",
    "8",
    "10",
    "12",
    "14",
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "XXL",
    "XXXL",
  ],
  "Ski suit": ["S", "M", "L", "XL"],
  "Base Layer": ["XS", "S", "M", "L", "XL", "XXL"],
  "Base Layer Top": ["XS", "S", "M", "L", "XL", "XXL"],
  "Base Layer Bottom": ["XS", "S", "M", "L", "XL", "XXL"],
  Hat: ["One Size", "S/M", "L/XL"],
  "Head band": ["One Size"],
  Gloves: ["XS", "S", "M", "L", "XL", "XXL"],
};
