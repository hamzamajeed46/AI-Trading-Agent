from statistics import pstdev

from langchain_core.runnables import RunnableConfig

from graph.state import SignalState


def _sma(closes: list[float], n: int) -> float | None:
    if len(closes) < n:
        return None
    return sum(closes[-n:]) / n


def quant_node(state: SignalState, config: RunnableConfig) -> dict:
    provider = config["configurable"]["market_data_provider"]
    symbol = state["symbol"]

    asset_name = provider.get_asset_name(symbol)

    try:
        bars = provider.get_bars(symbol, lookback_days=90)
    except Exception:
        bars = []

    if len(bars) < 2:
        return {
            "asset_name": asset_name,
            "price_at_call": bars[-1].close if bars else 0.0,
            "metrics": {"trend_pct": None, "volatility_pct": None, "sma_20": None, "sma_50": None},
        }

    closes = [b.close for b in bars]
    price_at_call = closes[-1]

    lookback = min(20, len(closes) - 1)
    trend_pct = ((closes[-1] - closes[-1 - lookback]) / closes[-1 - lookback]) * 100 if lookback > 0 else None

    daily_returns = [(closes[i] - closes[i - 1]) / closes[i - 1] for i in range(1, len(closes))]
    volatility_pct = pstdev(daily_returns) * (252**0.5) * 100 if len(daily_returns) > 1 else None

    metrics = {
        "trend_pct": round(trend_pct, 2) if trend_pct is not None else None,
        "volatility_pct": round(volatility_pct, 2) if volatility_pct is not None else None,
        "sma_20": round(_sma(closes, 20), 2) if _sma(closes, 20) is not None else None,
        "sma_50": round(_sma(closes, 50), 2) if _sma(closes, 50) is not None else None,
    }

    return {"asset_name": asset_name, "price_at_call": price_at_call, "metrics": metrics}
