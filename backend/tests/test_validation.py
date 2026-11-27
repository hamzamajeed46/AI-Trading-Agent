import pytest

from graph.validation import InvalidRecommendationError, validate_order_levels


def test_valid_buy():
    validate_order_levels("BUY", 100.0, 95.0, 110.0, 10)


def test_valid_sell():
    validate_order_levels("SELL", 100.0, 105.0, 90.0, 10)


@pytest.mark.parametrize(
    "decision,entry,stop,tp,qty",
    [
        ("BUY", 100.0, 105.0, 110.0, 10),  # stop above entry on a buy
        ("BUY", 100.0, 95.0, 98.0, 10),  # take-profit below entry on a buy
        ("SELL", 100.0, 95.0, 90.0, 10),  # stop below entry on a sell
        ("SELL", 100.0, 105.0, 102.0, 10),  # take-profit above... below-entry violated
        ("BUY", 100.0, 100.0, 110.0, 10),  # stop equals entry
        ("BUY", 100.0, 95.0, 110.0, 0),  # zero quantity
        ("BUY", 100.0, 95.0, 110.0, -3),  # negative quantity
        ("BUY", 0.0, 95.0, 110.0, 10),  # zero entry
        ("BUY", 100.0, -5.0, 110.0, 10),  # negative stop
        ("BUY", 100.0, float("nan"), 110.0, 10),  # NaN
        ("HOLD", 100.0, 95.0, 110.0, 10),  # HOLD has no order levels
    ],
)
def test_invalid_rejected(decision, entry, stop, tp, qty):
    with pytest.raises(InvalidRecommendationError):
        validate_order_levels(decision, entry, stop, tp, qty)
