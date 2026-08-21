from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph

from graph.nodes.debate import bear_node, bull_node
from graph.nodes.execution import execution_node
from graph.nodes.human_approval import human_approval_node
from graph.nodes.pm import pm_node
from graph.nodes.quant import quant_node
from graph.nodes.risk import risk_node
from graph.providers import is_crypto_symbol
from graph.state import SignalState

CONFIDENCE_THRESHOLD = 0.7
MAX_ROUNDS = 3


def route_after_pm(state: SignalState) -> str:
    confident = state["confidence"] >= CONFIDENCE_THRESHOLD or state["round"] >= MAX_ROUNDS
    if not confident:
        return "loop"
    if state["decision"] == "HOLD":
        return "end"
    # Alpaca doesn't support shorting crypto -- a SELL verdict with no
    # existing position isn't executable the way it is for equities, so
    # there's nothing to size/approve. End here rather than proposing a
    # trade risk_node can't actually turn into an order.
    if state["decision"] == "SELL" and is_crypto_symbol(state["symbol"]):
        return "end"
    return "risk"


def build_signal_graph(checkpointer: BaseCheckpointSaver | None = None, include_execution: bool = True):
    """`include_execution=False` builds the Phase 4 "/analyze" preview shape:
    the graph always ends at pm's verdict, even on a confident non-HOLD
    decision -- no ledger row, no interrupt(), no order. That preview has no
    db/user_id/thread_id in its config and no checkpointer, so it must never
    reach risk_node/human_approval_node/execution_node, which all require
    those. `include_execution=True` (the real HITL pipeline, used by
    services/signal_service.py's start/respond_to_recommendation) routes a
    confident non-HOLD decision through risk -> human_approval -> execution
    instead."""
    builder = StateGraph(SignalState)
    builder.add_node("quant", quant_node)
    builder.add_node("bull", bull_node)
    builder.add_node("bear", bear_node)
    builder.add_node("pm", pm_node)

    builder.add_edge(START, "quant")
    builder.add_edge("quant", "bull")
    builder.add_edge("bull", "bear")
    builder.add_edge("bear", "pm")

    if include_execution:
        builder.add_node("risk", risk_node)
        builder.add_node("human_approval", human_approval_node)
        builder.add_node("execution", execution_node)
        builder.add_conditional_edges("pm", route_after_pm, {"loop": "bull", "risk": "risk", "end": END})
        builder.add_edge("risk", "human_approval")
        builder.add_edge("human_approval", "execution")
        builder.add_edge("execution", END)
    else:
        builder.add_conditional_edges("pm", route_after_pm, {"loop": "bull", "risk": END, "end": END})

    return builder.compile(checkpointer=checkpointer)
