import pytest
from app.services.checkout import compute_commission


def test_standard_30_percent():
    mysl, seller = compute_commission(10.00, False, 0.30)
    assert mysl == 3.00
    assert seller == 7.00


def test_donate_proceeds_full_price_to_mysl():
    mysl, seller = compute_commission(10.00, True, 0.30)
    assert mysl == 10.00
    assert seller == 0.0


def test_donate_proceeds_ignores_commission_rate():
    mysl, seller = compute_commission(10.00, True, 0.0)
    assert mysl == 10.00
    assert seller == 0.0


def test_rounding_edge_case():
    # round(9.99 * 0.30, 2) = round(2.997, 2) = 3.0
    # seller = round(9.99 - 3.0, 2) = 6.99
    mysl, seller = compute_commission(9.99, False, 0.30)
    assert mysl == 3.00
    assert seller == 6.99


def test_zero_price():
    mysl, seller = compute_commission(0.0, False, 0.30)
    assert mysl == 0.0
    assert seller == 0.0


def test_25_percent_rate():
    mysl, seller = compute_commission(100.00, False, 0.25)
    assert mysl == 25.00
    assert seller == 75.00


def test_100_percent_rate():
    mysl, seller = compute_commission(50.00, False, 1.0)
    assert mysl == 50.00
    assert seller == 0.0


def test_sell_price_override_value_used():
    # Caller passes the resolved sell_price; this just confirms arithmetic
    mysl, seller = compute_commission(15.00, False, 0.30)
    assert mysl == 4.50
    assert seller == 10.50
