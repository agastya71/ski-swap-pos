"""Unit tests for the brand matching helper."""

from app.services.brand_match import closest_brand, normalize_brand


def test_normalize_brand_lowercases_and_strips_nonalnum():
    assert normalize_brand("  Rossi-Gnol  ") == "rossignol"
    assert normalize_brand("Atomic") == "atomic"
    assert normalize_brand(None) == ""


def test_closest_brand_returns_match_within_threshold():
    existing = ["Rossignol", "Atomic", "Salomon"]
    assert closest_brand("Rossignnol", existing) == "Rossignol"  # typo (extra n)
    assert closest_brand("rossignol", existing) == "Rossignol"  # exact (case-insensitive)
    assert closest_brand("Atmic", existing) == "Atomic"  # typo (missing o)


def test_closest_brand_returns_none_when_too_far():
    existing = ["Rossignol", "Atomic", "Salomon"]
    assert closest_brand("Totally Different", existing) is None
    assert closest_brand("", existing) is None
    assert closest_brand("Atomic", []) is None


def test_closest_brand_is_case_and_punctuation_insensitive():
    assert closest_brand("ROSSIGNOL!", ["rossignol"]) == "rossignol"