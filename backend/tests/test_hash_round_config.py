"""HASH_ROUNDS config tests — pin the test-time bcrypt cost factor.

The suite sets HASH_ROUNDS=4 in tests/conftest.py (before app imports) to
make bcrypt cheap; these tests fail loudly if conftest and the loaded
config ever drift apart, or if the env knob stops working.
"""

import os

from app.config import HASH_ROUNDS
from app.services.auth import hash_password, verify_password


def test_conftest_pins_hash_rounds():
    """conftest.py sets HASH_ROUNDS=4; the config read by the app must match.

    If conftest's os.environ.setdefault moves AFTER app import, or someone
    changes one side without the other, this catches it.
    """
    assert os.environ.get("HASH_ROUNDS") == "4"
    assert HASH_ROUNDS == 4


def test_pinned_rounds_produce_fast_bcrypt():
    """At 4 rounds a hash+verify pair must complete comfortably under 0.2s
    (~0.28s EACH at the production default of 12). Guards the actual speed
    win without being machine-speed brittle."""
    import time

    start = time.perf_counter()
    hashed = hash_password("speed-check")
    assert verify_password("speed-check", hashed)
    elapsed = time.perf_counter() - start
    assert elapsed < 0.2, f"bcrypt too slow for tests: {elapsed:.3f}s (rounds={HASH_ROUNDS})"


def test_pinned_rounds_embedded_in_hash():
    """bcrypt hashes embed their cost as $2b$<rounds>$ — the pin must be
    visible in the artifact so a broken env can't hide behind defaults."""
    hashed = hash_password("embed-check")
    assert hashed.startswith("$2b$04$"), hashed
