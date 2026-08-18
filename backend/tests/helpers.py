"""Shared test helpers for constructing valid API payloads.

These keep test payloads DRY as required-field contracts evolve (e.g. seller
registration now requires contact + address fields).
"""

from typing import Any


def valid_seller_create(**overrides: Any) -> dict[str, Any]:
    """Return a valid SellerCreate payload for an individual consignor.

    Override any field via kwargs, e.g. ``valid_seller_create(first_name="Bob")``.
    Pass ``is_vendor=True`` plus a ``company`` for a vendor payload, or use
    :func:`valid_vendor_create`.
    """
    base: dict[str, Any] = {
        "first_name": "Jane",
        "last_name": "Smith",
        "is_vendor": False,
        "phone": "6125551234",
        "address": "123 Main St",
        "city": "Minneapolis",
        "state": "MN",
        "zip": "55401",
    }
    base.update(overrides)
    return base


def valid_vendor_create(**overrides: Any) -> dict[str, Any]:
    """Return a valid SellerCreate payload for a commercial vendor."""
    base: dict[str, Any] = {
        "first_name": None,
        "last_name": None,
        "company": "Pioneer Sports",
        "is_vendor": True,
        "email": "orders@pioneersports.example",
        "phone": "6125559999",
        "address": "456 Industrial Blvd",
        "city": "Bloomington",
        "state": "MN",
        "zip": "55420",
    }
    # Drop None first/last so callers can override cleanly.
    base.update(overrides)
    return base