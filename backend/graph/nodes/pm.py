from typing import Literal

from langchain_core.exceptions import OutputParserException
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field, ValidationError

from graph.llm import get_llm
from graph.state import SignalState

MAX_ATTEMPTS = 2  # one retry on malformed/out-of-range output, then fail the run


class PMVerdict(BaseModel):
    decision: Literal["BUY", "HOLD", "SELL", "AVOID"]
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str


def _position_instructions(held_qty: float) -> str:
    """The user can only SELL shares they own. Without a position, a bearish
    view must be AVOID (don't buy yet / stay away), never SELL, since a SELL
    order on an unheld stock would silently open a short."""
    if held_qty > 0:
        return (
            f"The user currently HOLDS {held_qty:g} shares. Allowed decisions: BUY (add more), "
            "HOLD (keep the position), SELL (exit the position they hold). Never answer AVOID.\n\n"
        )
    return (
        "The user does NOT own this asset. Allowed decisions: BUY (open a position), HOLD "
        "(no strong view, wait), AVOID (bearish: do not buy it now). Never answer SELL, because "
        "there is nothing to sell.\n\n"
    )


def enforce_position_rules(decision: str, held_qty: float) -> str:
    """Deterministic backstop in case the model ignores the prompt: SELL
    without a position becomes AVOID, AVOID with a position becomes SELL."""
    if decision == "SELL" and held_qty <= 0:
        return "AVOID"
    if decision == "AVOID" and held_qty > 0:
        return "SELL"
    return decision


def pm_node(state: SignalState, config: RunnableConfig) -> dict:
    llm = get_llm(temperature=0.2).with_structured_output(PMVerdict, method="json_mode")

    prompt = (
        f"You are the Portfolio Manager on an AI trading floor. Symbol: {state['symbol']}. "
        f"Quant summary: {state['metrics']}. Price at call: {state['price_at_call']}.\n\n"
        f"Bull case(s):\n{state['bull_args']}\n\n"
        f"Bear case(s):\n{state['bear_args']}\n\n"
        f"{_position_instructions(state.get('held_qty', 0.0))}"
        "Weigh both sides plus the quant data into a single decision with a "
        "confidence score. Do not simply average the two sides -- decide which case is stronger. "
        "The `reasoning` field should be 2-4 short markdown bullet points (`-` list), one deciding "
        "factor per bullet, with the key numbers bolded (`**...**`). No headers, no tables, no "
        "nested sub-bullets.\n\n"
        "Respond with ONLY a JSON object matching this schema: "
        '{"decision": "BUY" | "HOLD" | "SELL" | "AVOID", "confidence": <float 0.0-1.0>, "reasoning": <string>}.'
    )
    verdict: PMVerdict | None = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            verdict = llm.invoke(prompt)
            break
        except (ValidationError, OutputParserException):
            # Malformed JSON or a value outside the schema (e.g. confidence 1.4).
            # Retry once; a second failure propagates and fails the run cleanly.
            if attempt == MAX_ATTEMPTS - 1:
                raise
    decision = enforce_position_rules(verdict.decision, state.get("held_qty", 0.0))
    return {"decision": decision, "confidence": verdict.confidence, "rationale": verdict.reasoning}
