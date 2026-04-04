def compute_commission(
    item_price: float, donate_proceeds: bool, commission_rate: float
) -> tuple[float, float]:
    """Return (mysl_share, seller_share) rounded to 2 decimal places."""
    if donate_proceeds:
        return round(item_price, 2), 0.0
    mysl = round(item_price * commission_rate, 2)
    return mysl, round(item_price - mysl, 2)
