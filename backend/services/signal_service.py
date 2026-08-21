import uuid
from typing import Iterator

from langgraph.types import Command
from sqlalchemy.orm import Session

from db.models import Approval, Recommendation
from graph.providers import MarketDataProvider
from graph.signal_graph import build_signal_graph
from services.broker_service import build_broker_for_user, build_provider_for_user


class RecommendationNotFoundError(Exception):
    pass


class RecommendationNotPendingError(Exception):
    pass


def _initial_state(symbol: str) -> dict:
    return {
        "symbol": symbol.upper(),
        "asset_name": None,
        "price_at_call": 0.0,
        "metrics": {},
        "bull_args": [],
        "bear_args": [],
        "round": 0,
        "decision": "",
        "confidence": 0.0,
        "rationale": "",
        "mode": "live",
        "recommendation_id": None,
        "proposed_qty": None,
        "entry_price_hint": None,
        "stop_price": None,
        "take_profit_price": None,
        "recommended_timeline": None,
        "human_decision": None,
        "order_id": None,
        "execution_status": None,
        "execution_error": None,
    }


def run_signal_for_user(db: Session, user_id: str, symbol: str) -> dict:
    """Builds this user's Alpaca provider, runs the signal graph for `symbol`,
    and returns the final state. Shared by scripts/run_signal.py (CLI) and
    the /analyze HTTP endpoint -- one place owns "what does it mean to run
    the signal graph for a user," not two copies of it. Uses the
    include_execution=False preview shape: a real, un-persisted debate, but
    it always ends at pm's verdict -- no ledger row, no interrupt, no order.
    The persisted human-in-the-loop pipeline is services/signal_service.py's
    start_recommendation/respond_to_recommendation instead."""
    provider = build_provider_for_user(db, user_id, symbol)
    graph = build_signal_graph(include_execution=False)
    config = {"configurable": {"market_data_provider": provider}, "recursion_limit": 25}
    return graph.invoke(_initial_state(symbol), config=config)


def stream_signal(provider: MarketDataProvider, symbol: str) -> Iterator[dict]:
    """Yields one {node_name: partial_state} dict per completed node, instead
    of blocking until the whole graph finishes -- lets a caller (the
    /analyze/{symbol}/stream endpoint) show each debate round as it's
    produced rather than making the user wait through all of them silently.
    Takes an already-built provider (not db/user_id) since the caller needs
    to resolve that eagerly anyway, before committing to a streaming HTTP
    response whose status code can't be changed once headers are sent.
    Same preview shape as run_signal_for_user -- see its docstring."""
    graph = build_signal_graph(include_execution=False)
    config = {"configurable": {"market_data_provider": provider}, "recursion_limit": 25}
    yield from graph.stream(_initial_state(symbol), config=config, stream_mode="updates")


def _to_summary(thread_id: str, result: dict) -> dict:
    pending = "__interrupt__" in result
    if pending:
        response_status = "pending_approval"
    elif result["decision"] == "HOLD":
        response_status = "hold"
    elif result.get("execution_status"):
        response_status = result["execution_status"]  # "submitted" | "rejected" | "failed"
    else:
        # Reached END without ever pausing or executing -- only happens for
        # a SELL verdict on a crypto symbol, since Alpaca doesn't support
        # shorting crypto (route_after_pm routes that case straight to END
        # instead of risk_node -- see graph/signal_graph.py).
        response_status = "not_executable"

    return {
        "thread_id": thread_id,
        "recommendation_id": result.get("recommendation_id"),
        "symbol": result["symbol"],
        "asset_name": result.get("asset_name"),
        "decision": result["decision"],
        "confidence": result["confidence"],
        "rationale": result["rationale"],
        "proposed_qty": result.get("proposed_qty"),
        "entry_price_hint": result.get("entry_price_hint"),
        "stop_price": result.get("stop_price"),
        "take_profit_price": result.get("take_profit_price"),
        "recommended_timeline": result.get("recommended_timeline"),
        "execution_status": result.get("execution_status"),
        "execution_error": result.get("execution_error"),
        "order_id": result.get("order_id"),
        "status": response_status,
    }


def _recommendation_config(db: Session, user_id: str, thread_id: str, symbol: str) -> dict:
    provider = build_provider_for_user(db, user_id, symbol)
    broker = build_broker_for_user(db, user_id)
    return {
        "configurable": {
            "thread_id": thread_id,
            "market_data_provider": provider,
            "broker": broker,
            "db": db,
            "user_id": user_id,
        },
        "recursion_limit": 25,
    }


async def start_recommendation(app_graph, db: Session, user_id: str, symbol: str) -> dict:
    """Starts a fresh, persisted human-in-the-loop run: a new thread_id, the
    real HITL graph shape (risk -> human_approval -> execution on a
    confident non-HOLD decision), checkpointed so it survives a backend
    restart while paused at the interrupt."""
    thread_id = str(uuid.uuid4())
    config = _recommendation_config(db, user_id, thread_id, symbol)
    result = await app_graph.ainvoke(_initial_state(symbol), config=config)
    return _to_summary(thread_id, result)


async def respond_to_recommendation(
    app_graph, db: Session, user_id: str, thread_id: str, decision: str, note: str | None = None
) -> dict:
    """Records the human's approve/reject as an Approval row, then resumes
    the paused graph -- execution_node (not this function) is what actually
    submits the order or marks the recommendation rejected."""
    if decision not in ("approve", "reject"):
        raise ValueError(f"decision must be 'approve' or 'reject', got {decision!r}")

    recommendation = (
        db.query(Recommendation)
        .filter(Recommendation.thread_id == thread_id, Recommendation.user_id == user_id)
        .first()
    )
    if recommendation is None:
        raise RecommendationNotFoundError(f"No recommendation found for thread {thread_id}")
    if recommendation.status != "pending_approval":
        raise RecommendationNotPendingError(
            f"Recommendation {recommendation.id} is not pending approval (status={recommendation.status})"
        )

    db.add(Approval(recommendation_id=recommendation.id, decision=decision, note=note))
    db.commit()

    config = _recommendation_config(db, user_id, thread_id, recommendation.symbol)
    result = await app_graph.ainvoke(Command(resume=decision), config=config)
    return _to_summary(thread_id, result)


async def list_recommendations(app_graph, db: Session, user_id: str, status: str | None) -> list[dict]:
    """Recommendation rows carry the audit-level summary (symbol/decision/
    confidence/status); the order-shaping detail (proposed_qty, stop/take-
    profit, timeline) isn't duplicated into its own columns -- it's read
    live from the checkpointer via thread_id, since that's the value
    LangGraph already persists as the interrupt/graph state."""
    query = db.query(Recommendation).filter(Recommendation.user_id == user_id)
    if status:
        query = query.filter(Recommendation.status == status)
    rows = query.order_by(Recommendation.created_at.desc()).all()

    summaries = []
    for row in rows:
        snapshot = await app_graph.aget_state({"configurable": {"thread_id": row.thread_id}})
        values = snapshot.values or {}
        summaries.append(
            {
                "thread_id": row.thread_id,
                "recommendation_id": row.id,
                "symbol": row.symbol,
                "asset_name": values.get("asset_name"),
                "decision": row.decision,
                "confidence": row.confidence,
                "rationale": row.rationale,
                "proposed_qty": values.get("proposed_qty"),
                "entry_price_hint": values.get("entry_price_hint"),
                "stop_price": values.get("stop_price"),
                "take_profit_price": values.get("take_profit_price"),
                "recommended_timeline": values.get("recommended_timeline"),
                "execution_status": values.get("execution_status"),
                "execution_error": values.get("execution_error"),
                "order_id": values.get("order_id"),
                "status": row.status,
                "created_at": row.created_at,
            }
        )
    return summaries
