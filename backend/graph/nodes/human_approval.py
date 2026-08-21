from langchain_core.runnables import RunnableConfig
from langgraph.types import interrupt

from graph.state import SignalState


def human_approval_node(state: SignalState, config: RunnableConfig) -> dict:
    """Nothing but the interrupt() call -- on resume, LangGraph re-executes
    this node from the top, so any DB write here would run again on every
    resume. The pending-approval ledger row is written by risk_node instead."""
    human_decision = interrupt(
        {
            "recommendation_id": state["recommendation_id"],
            "symbol": state["symbol"],
            "decision": state["decision"],
            "confidence": state["confidence"],
            "rationale": state["rationale"],
            "proposed_qty": state["proposed_qty"],
            "entry_price_hint": state["entry_price_hint"],
            "stop_price": state["stop_price"],
            "take_profit_price": state["take_profit_price"],
            "recommended_timeline": state["recommended_timeline"],
        }
    )
    return {"human_decision": human_decision}
