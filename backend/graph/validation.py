"""Sanity checks on a proposed trade, run before anything is written to the
ledger or shown for approval. A bad level here (stop on the wrong side of
entry, zero quantity) would otherwise reach a real bracket order."""

import math


class InvalidRecommendationError(ValueError):
    """The proposed trade is internally inconsistent and must not reach approval."""


def _is_positive_number(value) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(value) and value > 0


def validate_order_levels(
    decision: str, entry: float, stop: float, take_profit: float, qty: float
) -> None:
    """BUY needs stop < entry < take_profit; SELL needs the reverse.
    All prices and the quantity must be finite and positive."""
    if decision not in ("BUY", "SELL"):
        raise InvalidRecommendationError(f"Only BUY/SELL decisions carry order levels, got {decision!r}.")

    for name, value in (("entry price", entry), ("stop price", stop), ("take-profit price", take_profit)):
        if not _is_positive_number(value):
            raise InvalidRecommendationError(f"Invalid {name}: {value!r}.")

    if not _is_positive_number(qty):
        raise InvalidRecommendationError(
            "Proposed quantity is zero. The account may not have enough buying power for this trade."
        )

    if decision == "BUY" and not (stop < entry < take_profit):
        raise InvalidRecommendationError(
            f"Invalid BUY levels: need stop < entry < take-profit, got {stop} / {entry} / {take_profit}."
        )
    if decision == "SELL" and not (take_profit < entry < stop):
        raise InvalidRecommendationError(
            f"Invalid SELL levels: need take-profit < entry < stop, got {take_profit} / {entry} / {stop}."
        )
