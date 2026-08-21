import os
from datetime import datetime, timedelta, timezone

from alpaca.data.historical.crypto import CryptoHistoricalDataClient
from alpaca.data.historical.stock import StockHistoricalDataClient
from alpaca.data.requests import (
    CryptoBarsRequest,
    CryptoLatestQuoteRequest,
    StockBarsRequest,
    StockLatestQuoteRequest,
)
from alpaca.data.timeframe import TimeFrame
from alpaca.trading.client import TradingClient

from graph.providers import Bar, Quote


def get_data_client() -> StockHistoricalDataClient:
    return StockHistoricalDataClient(
        api_key=os.environ["ALPACA_API_KEY"],
        secret_key=os.environ["ALPACA_SECRET_KEY"],
    )


def get_recent_daily_bars(symbol: str, limit: int = 5) -> list[dict]:
    start = datetime.now(timezone.utc) - timedelta(days=limit * 3)
    request = StockBarsRequest(
        symbol_or_symbols=[symbol],
        timeframe=TimeFrame.Day,
        start=start,
    )
    bar_set = get_data_client().get_stock_bars(request)
    return [
        {
            "timestamp": bar.timestamp.isoformat(),
            "open": bar.open,
            "high": bar.high,
            "low": bar.low,
            "close": bar.close,
            "volume": bar.volume,
        }
        for bar in bar_set[symbol][-limit:]
    ]


class AlpacaMarketDataProvider:
    """graph.providers.MarketDataProvider implementation scoped to one user's
    own Alpaca credentials -- nodes only ever see this, never raw keys."""

    def __init__(self, api_key: str, secret_key: str) -> None:
        self._client = StockHistoricalDataClient(api_key=api_key, secret_key=secret_key)
        self._trading_client = TradingClient(api_key=api_key, secret_key=secret_key, paper=True)

    def get_bars(self, symbol: str, lookback_days: int) -> list[Bar]:
        start = datetime.now(timezone.utc) - timedelta(days=lookback_days)
        request = StockBarsRequest(symbol_or_symbols=[symbol], timeframe=TimeFrame.Day, start=start)
        bar_set = self._client.get_stock_bars(request)
        return [
            Bar(timestamp=b.timestamp, open=b.open, high=b.high, low=b.low, close=b.close, volume=b.volume)
            for b in bar_set[symbol]
        ]

    def get_latest_quote(self, symbol: str) -> Quote:
        request = StockLatestQuoteRequest(symbol_or_symbols=[symbol])
        quote_set = self._client.get_stock_latest_quote(request)
        q = quote_set[symbol]
        return Quote(bid_price=q.bid_price, ask_price=q.ask_price, timestamp=q.timestamp)

    def get_asset_name(self, symbol: str) -> str | None:
        # Ticker collisions are real -- e.g. "BTC" resolves here to the
        # Grayscale Bitcoin Mini Trust ETF (a real equity), not spot Bitcoin.
        # Surfacing the actual instrument name is how a user notices that,
        # for any symbol, not just crypto-shaped ones.
        try:
            asset = self._trading_client.get_asset(symbol)
            return asset.name
        except Exception:
            return None


class AlpacaCryptoMarketDataProvider:
    """graph.providers.MarketDataProvider implementation for crypto pairs
    (e.g. "BTC/USD") -- Alpaca splits market data into separate equity/crypto
    REST namespaces, so this is a distinct client from AlpacaMarketDataProvider,
    picked by services/broker_service.py based on the symbol's shape. Order
    submission/positions/account (integrations/alpaca_trading.py::AlpacaBroker)
    stay a single class -- Alpaca's TradingClient handles both asset classes
    through the same endpoints, only market data is split."""

    def __init__(self, api_key: str, secret_key: str) -> None:
        self._client = CryptoHistoricalDataClient(api_key=api_key, secret_key=secret_key)
        self._trading_client = TradingClient(api_key=api_key, secret_key=secret_key, paper=True)

    def get_bars(self, symbol: str, lookback_days: int) -> list[Bar]:
        start = datetime.now(timezone.utc) - timedelta(days=lookback_days)
        request = CryptoBarsRequest(symbol_or_symbols=[symbol], timeframe=TimeFrame.Day, start=start)
        bar_set = self._client.get_crypto_bars(request)
        return [
            Bar(timestamp=b.timestamp, open=b.open, high=b.high, low=b.low, close=b.close, volume=b.volume)
            for b in bar_set[symbol]
        ]

    def get_latest_quote(self, symbol: str) -> Quote:
        request = CryptoLatestQuoteRequest(symbol_or_symbols=[symbol])
        quote_set = self._client.get_crypto_latest_quote(request)
        q = quote_set[symbol]
        return Quote(bid_price=q.bid_price, ask_price=q.ask_price, timestamp=q.timestamp)

    def get_asset_name(self, symbol: str) -> str | None:
        try:
            asset = self._trading_client.get_asset(symbol)
            return asset.name
        except Exception:
            return None
