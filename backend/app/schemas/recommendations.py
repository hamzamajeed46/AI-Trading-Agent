from datetime import datetime

from pydantic import BaseModel


class AnalyzeResponse(BaseModel):
    symbol: str
    asset_name: str | None
    price_at_call: float
    metrics: dict
    rounds: int
    bull_args: list[str]
    bear_args: list[str]
    decision: str
    confidence: float
    rationale: str


class StartRecommendationRequest(BaseModel):
    symbol: str


class RespondRequest(BaseModel):
    note: str | None = None


class RecommendationSummary(BaseModel):
    thread_id: str
    recommendation_id: str | None
    symbol: str
    asset_name: str | None = None
    decision: str
    confidence: float
    rationale: str
    proposed_qty: float | None = None
    entry_price_hint: float | None = None
    stop_price: float | None = None
    take_profit_price: float | None = None
    recommended_timeline: str | None = None
    execution_status: str | None = None
    execution_error: str | None = None
    order_id: str | None = None
    status: str
    created_at: datetime | None = None
