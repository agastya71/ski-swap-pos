from app.services.checkout import compute_commission, compute_card_fee


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


def test_card_fee_full_charge_of_100_items():
    # All-card sale of $100.00 of items → terminal charge $103.00 → fee $3.00
    assert compute_card_fee(103.00) == 3.00


def test_card_fee_partial_charge():
    # $50.00 of items financed on card → terminal charge $51.50 → fee $1.50
    assert compute_card_fee(51.50) == 1.50


def test_card_fee_exact_3_percent_of_financed_items():
    # Terminal charge 30.90 = $30.00 items + fee → fee decodes to $0.90
    assert compute_card_fee(30.90) == 0.90


def test_card_fee_zero_without_card_tender():
    assert compute_card_fee(0.0) == 0.0


def test_card_fee_negative_charge_returns_zero():
    assert compute_card_fee(-5.00) == 0.0
