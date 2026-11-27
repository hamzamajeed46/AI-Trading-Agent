from langchain_core.runnables import RunnableConfig

from db.models import Order, Position, Recommendation
from graph.providers import is_crypto_symbol
from graph.state import SignalState


def execution_node(state: SignalState, config: RunnableConfig) -> dict:
    """Turns the human's approve/reject into the final DB state: a rejection
    just closes out the recommendation, an approval submits a real order
    against the user's own broker and records Order + Position rows. Broker
    failures (e.g. insufficient buying power) are caught here rather than
    left to propagate, so the graph always reaches END with a clear
    execution_status instead of the resume call raising a raw exception."""
    db = config["configurable"]["db"]
    recommendation_id = state["recommendation_id"]

    if state.get("human_decision") != "approve":
        db.query(Recommendation).filter(Recommendation.id == recommendation_id).update(
            {"status": "rejected"}
        )
        db.commit()
        return {"execution_status": "rejected", "execution_error": None}

    broker = config["configurable"]["broker"]
    is_exit = state["decision"] == "SELL"
    side = "sell" if is_exit else "buy"
    qty = state["proposed_qty"]

    if is_exit:
        # Re-check the holding at approval time: the recommendation may be
        # stale (shares sold since, or a pending SELL from before exits were
        # position-aware). Never sell more than is held -- that would open a short.
        held_qty = broker.get_held_qty(state["symbol"])
        if held_qty <= 0:
            db.query(Recommendation).filter(Recommendation.id == recommendation_id).update(
                {"status": "execution_failed"}
            )
            db.commit()
            return {
                "execution_status": "failed",
                "execution_error": "You no longer hold any shares of this symbol, so there is nothing to sell.",
            }
        qty = min(qty, held_qty)

    try:
        if is_exit:
            # Selling shares the user holds: plain market order, no bracket.
            alpaca_order_id = broker.submit_market_order(
                symbol=state["symbol"], qty=qty, side="sell"
            )
        else:
            alpaca_order_id = broker.submit_bracket_order(
                symbol=state["symbol"],
                qty=state["proposed_qty"],
                side=side,
                stop_price=state["stop_price"],
                take_profit_price=state["take_profit_price"],
            )
    except Exception as exc:
        db.query(Recommendation).filter(Recommendation.id == recommendation_id).update(
            {"status": "execution_failed"}
        )
        db.commit()
        return {"execution_status": "failed", "execution_error": str(exc)}

    # Alpaca rejects bracket (OTOCO) orders for crypto -- AlpacaBroker falls
    # back to a plain market order for those, so the ledger should say so
    # rather than claiming stop/take-profit protection that isn't real.
    order_class = "market" if (is_exit or is_crypto_symbol(state["symbol"])) else "bracket"

    order = Order(
        recommendation_id=recommendation_id,
        alpaca_order_id=alpaca_order_id,
        side=side,
        qty=qty,
        order_class=order_class,
        stop_price=state["stop_price"],
        take_profit_price=state["take_profit_price"],
        status="submitted",
        mode=state.get("mode", "live"),
    )
    db.add(order)
    db.flush()

    # An exit closes an existing position rather than opening one, so no new
    # Position row (closing/pnl bookkeeping belongs to the lifecycle phase).
    if not is_exit:
        db.add(
            Position(
                user_id=config["configurable"]["user_id"],
                symbol=state["symbol"],
                entry_order_id=order.id,
                recommended_timeline=state.get("recommended_timeline"),
                mode=state.get("mode", "live"),
            )
        )
    db.query(Recommendation).filter(Recommendation.id == recommendation_id).update({"status": "approved"})
    db.commit()

    return {"execution_status": "submitted", "order_id": alpaca_order_id, "execution_error": None}
