import {
  ITEM_TYPES,
  CATEGORIES,
  CATEGORY_TYPES,
  typesForCategory,
} from "./itemSizes";

describe("ITEM_TYPES", () => {
  it("contains all 23 equipment types (incl. Skate/Classic/Combi XC)", () => {
    expect(ITEM_TYPES).toHaveLength(23);
    expect(ITEM_TYPES).toContain("Alpine Ski");
    expect(ITEM_TYPES).toContain("Skate");
    expect(ITEM_TYPES).toContain("Classic");
    expect(ITEM_TYPES).toContain("Combi");
    expect(ITEM_TYPES).toContain("Touring");
    expect(ITEM_TYPES).toContain("Ski Boot");
    expect(ITEM_TYPES).toContain("Other");
    expect(ITEM_TYPES).not.toContain("Snowboard Pole");
  });
});

describe("CATEGORY_TYPES", () => {
  it("categories stay in sync with ITEM_TYPES/CATEGORY_TYPES expectations", () => {
    expect(CATEGORIES).toContain("Skis");
    expect(CATEGORIES).toContain("Clothing");
    expect(CATEGORY_TYPES["Skis"]).toEqual([
      "Classic",
      "Skate",
      "Combi",
      "Other",
    ]);
    expect(CATEGORY_TYPES["Boots"]).toEqual([
      "Classic",
      "Skate",
      "Combi",
      "Touring",
      "Other",
    ]);
    expect(CATEGORY_TYPES["Clothing"]).toEqual([
      "Base Layer Bottom",
      "Base Layer Top",
      "Gloves",
      "Hat",
      "Head band",
      "Jacket",
      "Ski Pants",
      "Ski suit",
    ]);
    expect(typesForCategory("Skis")).toContain("Other");
    expect(typesForCategory("Boots")).toContain("Other");
  });

  it("typesForCategory falls back to the full list for empty/unknown/unmapped", () => {
    expect(typesForCategory(null)).toEqual(ITEM_TYPES);
    expect(typesForCategory("Bindings")).toEqual(ITEM_TYPES);
    expect(typesForCategory("Mystery")).toEqual(ITEM_TYPES);
  });
});
