"""Brand matching helpers for item intake and bulk import.

Brands are free text, but typos fragment reports (e.g. "Rossignol" vs "Rossi" vs
"Rossignnol"). These helpers normalize brand strings and find the closest
existing brand within an edit-distance threshold, used:
- on the frontend typeahead (via GET /items/brands), and
- on bulk import to replace a row's brand with the closest existing match.
"""

import re

_NON_ALNUM = re.compile(r"[^a-z0-9]")


def normalize_brand(value: str | None) -> str:
    """Normalize a brand string for comparison: lowercase, collapse whitespace,
    strip non-alphanumeric characters so "Rossi gnol" and "rossignol" compare equal."""
    if value is None:
        return ""
    return _NON_ALNUM.sub("", value.strip().lower())


def _levenshtein(a: str, b: str) -> int:
    """Standard edit distance between two strings."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i]
        for j, cb in enumerate(b, start=1):
            ins = curr[j - 1] + 1
            dele = prev[j] + 1
            sub = prev[j - 1] + (ca != cb)
            curr.append(min(ins, dele, sub))
        prev = curr
    return prev[-1]


def closest_brand(value: str | None, existing: list[str], threshold: int = 2) -> str | None:
    """Return the closest existing brand to ``value`` within the edit-distance
    threshold (on normalized forms), or None if no existing brand is close enough.

    Ties are broken by the original brand that appears first in ``existing``.
    The returned value is the original (non-normalized) existing brand string.
    """
    target = normalize_brand(value)
    if not target or not existing:
        return None
    best: str | None = None
    best_dist = threshold + 1
    for brand in existing:
        dist = _levenshtein(target, normalize_brand(brand))
        if dist < best_dist:
            best_dist = dist
            best = brand
    return best if best_dist <= threshold else None