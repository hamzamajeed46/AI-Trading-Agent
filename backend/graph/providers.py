from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


def is_crypto_symbol(symbol: str) -> bool:
    """Alpaca's crypto pairs use "BASE/QUOTE" notation (e.g. "BTC/USD"), which
    never appears in a real US equity ticker -- used to route a run to the
    crypto market-data client/order semantics instead of the equity ones."""
    return "/" in symbol


@dataclass
class Bar:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass
class Quote:
    bid_price: float
    ask_price: float
    timestamp: datetime


class MarketDataProvider(Protocol):
    def get_bars(self, symbol: str, lookback_days: int) -> list[Bar]: ...
    def get_latest_quote(self, symbol: str) -> Quote: ...
    def get_asset_name(self, symbol: str) -> str | None: ...


class Broker(Protocol):
    """Not implemented until Phase 5 (human-in-the-loop + real orders) --
    declared now so the DI seam's shape matches PLAN.md from the start."""

    def submit_bracket_order(
        self, symbol: str, qty: float, side: str, stop_price: float, take_profit_price: float
    ) -> str: ...
    def get_position(self, symbol: str): ...
    def close_position(self, symbol: str) -> None: ...
    def get_buying_power(self) -> float: ...
    def get_equity(self) -> float: ...
    def get_held_qty(self, symbol: str) -> float: ...
    def submit_market_order(self, symbol: str, qty: float, side: str) -> str: ...
