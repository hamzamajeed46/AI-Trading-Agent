from langchain_core.runnables import RunnableConfig

from app.config import settings
from db.models import Recommendation
from graph.providers import is_crypto_symbol
from graph.state import SignalState
from graph.validation import validate_order_levels

# Simple, deterministic MVP risk model (no PLAN.md formula specified): stop
# distance scales with the quant node's annualized volatility, clamped to a
# sane range so a very calm or very wild symbol doesn't produce a degenerate
# stop; take-profit sits at a fixed 1:2 reward:risk multiple of that same
# distance; position size risks a percentage of the account's live equity
# (settings.risk_per_trade_pct, capped at settings.risk_per_trade_cap_usd) per
# trade, sized off the stop distance in dollars -- then capped against
# the account's actual live buying power, so the risk formula alone can
# never propose a trade bigger than the account can afford.
MIN_STOP_PCT = 1.5
MAX_STOP_PCT = 8.0
DEFAULT_VOLATILITY_PCT = 20.0
REWARD_RISK_RATIO = 2.0
CRYPTO_QTY_PRECISION = 6  # Alpaca crypto orders take fractional qty (e.g. 0.008 BTC)


def compute_risk_budget(equity: float) -> float:
    """Dollars this trade may lose if the stop is hit: a percentage of live
    account equity, never more than the hard dollar cap."""
    return min(equity * settings.risk_per_trade_pct / 100, settings.risk_per_trade_cap_usd)


def risk_node(state: SignalState, config: RunnableConfig) -> dict:
    """Turns the PM's BUY/SELL decision into concrete order parameters and
    writes the pending-approval ledger row. This write belongs here, not in
    human_approval_node -- only the interrupting node re-executes on resume,
    so a DB write there would run twice (once per approve/reject call)."""
    price = state["price_at_call"]
    volatility_pct = state["metrics"].get("volatility_pct") or DEFAULT_VOLATILITY_PCT
    stop_distance_pct = min(max(volatility_pct / 10, MIN_STOP_PCT), MAX_STOP_PCT)
    stop_distance = price * stop_distance_pct / 100

    if state["decision"] == "BUY":
        stop_price = price - stop_distance
        take_profit_price = price + stop_distance * REWARD_RISK_RATIO
    else:  # SELL -- opens a short position, so stop/take-profit mirror around price
        stop_price = price + stop_distance
        take_profit_price = price - stop_distance * REWARD_RISK_RATIO

    is_crypto = is_crypto_symbol(state["symbol"])

    broker = config["configurable"]["broker"]
    risk_budget_usd = compute_risk_budget(broker.get_equity())

    # Equity bracket orders require whole shares; crypto orders are
    # fractional (a single BTC can be worth tens of thousands of dollars, so
    # truncating to a whole unit would round most crypto positions to 0).
    if is_crypto:
        risk_based_qty = (
            round(risk_budget_usd / stop_distance, CRYPTO_QTY_PRECISION) if stop_distance > 0 else 0.0
        )
    else:
        risk_based_qty = int(risk_budget_usd // stop_distance) if stop_distance > 0 else 1

    # The dollar-risk formula above has no idea what the account can actually
    # afford -- it was sizing purely off the stop distance. Cap it against
    # the account's real, live buying power so a proposal can never exceed
    # what Alpaca would actually accept.
    buying_power = broker.get_buying_power()
    if is_crypto:
        affordable_qty = round(buying_power / price, CRYPTO_QTY_PRECISION) if price > 0 else 0.0
    else:
        affordable_qty = int(buying_power // price) if price > 0 else 0
    proposed_qty = max(0, min(risk_based_qty, affordable_qty))

    if is_crypto:
        # Crypto markets run 24/7 -- "trading days" doesn't mean anything here.
        recommended_timeline = "3-10 days (swing)" if state["confidence"] >= 0.85 else "1-3 days (short-term)"
    else:
        recommended_timeline = (
            "3-10 trading days (swing)" if state["confidence"] >= 0.85 else "1-3 trading days (short-term)"
        )

    # 2 decimal places fits USD-scale prices (equities and BTC/ETH-tier
    # crypto alike); low-value altcoins would need more, but that's a
    # precision refinement for later, not something blocking basic support.
    price_precision = CRYPTO_QTY_PRECISION if is_crypto else 2

    stop_price = round(stop_price, price_precision)
    take_profit_price = round(take_profit_price, price_precision)

    # Reject an inconsistent proposal before the ledger row exists, so it can
    # never be shown for approval or turned into a bracket order.
    validate_order_levels(state["decision"], price, stop_price, take_profit_price, proposed_qty)

    db = config["configurable"]["db"]
    recommendation = Recommendation(
        user_id=config["configurable"]["user_id"],
        thread_id=config["configurable"]["thread_id"],
        symbol=state["symbol"],
        round=state["round"],
        decision=state["decision"],
        confidence=state["confidence"],
        rationale=state["rationale"],
        metrics_json=state["metrics"],
        mode=state.get("mode", "live"),
        status="pending_approval",
    )
    db.add(recommendation)
    db.commit()
    db.refresh(recommendation)

    return {
        "recommendation_id": recommendation.id,
        "entry_price_hint": price,
        "stop_price": stop_price,
        "take_profit_price": take_profit_price,
        "proposed_qty": proposed_qty,
        "recommended_timeline": recommended_timeline,
    }
