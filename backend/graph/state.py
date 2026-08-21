import operator
from typing import Annotated, TypedDict


class SignalState(TypedDict):
    symbol: str
    asset_name: str | None
    price_at_call: float
    metrics: dict
    bull_args: Annotated[list[str], operator.add]
    bear_args: Annotated[list[str], operator.add]
    round: int
    decision: str
    confidence: float
    rationale: str
    mode: str  # "live" | "backtest"
    recommendation_id: str | None
    proposed_qty: float | None
    entry_price_hint: float | None
    stop_price: float | None
    take_profit_price: float | None
    recommended_timeline: str | None
    human_decision: str | None  # "approve" | "reject", set by human_approval_node on resume
    order_id: str | None
    execution_status: str | None  # "submitted" | "rejected" | "failed"
    execution_error: str | None
