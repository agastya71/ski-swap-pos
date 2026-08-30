"""Canonical category and item-type vocabularies shared by intake and bulk import.

Mirrors the frontend lists (frontend/src/lib/itemSizes.ts) so a filled template
typed with any capitalization ("skis", "ALPINE SKI") normalizes to the canonical
casing instead of creating near-duplicate values ("skis" vs "Skis"). Unknown
values are never rejected — they are stored as typed — but known values are
snapped to canonical casing so category→type filtering and reports stay clean.
"""

CATEGORIES: list[str] = [
    "Skis",
    "Ski Boots",
    "Ski Poles",
    "Snowboard",
    "Snowboard Boots",
    "Bindings",
    "Helmet",
    "Clothing",
    "Other",
]

ITEM_TYPES: list[str] = [
    "Alpine Ski",
    "Snowboard",
    "Nordic/XC Ski",
    "Skate",
    "Classic",
    "Ski Boot",
    "Snowboard Boot",
    "Ski Pole",
    "Helmet",
    "Goggles",
    "Jacket",
    "Pants",
    "Base Layer",
    "Gloves",
    "Other",
]

#: Types offered per category in the intake UI and honored by bulk import.
#: Skis carries XC/Skate/Classic per tester request; Bindings falls back to the
#: full type list at query time.
CATEGORY_TYPES: dict[str, list[str]] = {
    "Skis": ["Alpine Ski", "Nordic/XC Ski", "Skate", "Classic"],
    "Ski Boots": ["Ski Boot"],
    "Ski Poles": ["Ski Pole"],
    "Snowboard": ["Snowboard"],
    "Snowboard Boots": ["Snowboard Boot"],
    "Helmet": ["Helmet"],
    "Clothing": ["Jacket", "Pants", "Base Layer", "Gloves"],
}


def canonical_of(value: str, vocab: list[str]) -> str | None:
    """Return the canonical (correctly-cased) vocab entry matching ``value``
    case-insensitively after trimming, or None when nothing matches."""
    probe = (value or "").strip().lower()
    if not probe:
        return None
    for entry in vocab:
        if entry.lower() == probe:
            return entry
    return None


def canonicalize_category(value: str | None) -> str | None:
    """Case-insensitively normalize a category; unknown values pass through as typed."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return canonical_of(text, CATEGORIES) or text


def canonicalize_type(value: str | None) -> str | None:
    """Case-insensitively normalize an item type; unknown values pass through as typed."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return canonical_of(text, ITEM_TYPES) or text