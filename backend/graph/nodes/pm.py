from typing import Literal

from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from graph.llm import get_llm
from graph.state import SignalState


class PMVerdict(BaseModel):
    decision: Literal["BUY", "HOLD", "SELL"]
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str


def pm_node(state: SignalState, config: RunnableConfig) -> dict:
    llm = get_llm(temperature=0.2).with_structured_output(PMVerdict, method="json_mode")

    prompt = (
        f"You are the Portfolio Manager on an AI trading floor. Symbol: {state['symbol']}. "
        f"Quant summary: {state['metrics']}. Price at call: {state['price_at_call']}.\n\n"
        f"Bull case(s):\n{state['bull_args']}\n\n"
        f"Bear case(s):\n{state['bear_args']}\n\n"
        "Weigh both sides plus the quant data into a single BUY/HOLD/SELL decision with a "
        "confidence score. Do not simply average the two sides -- decide which case is stronger. "
        "The `reasoning` field should be 2-4 short markdown bullet points (`-` list), one deciding "
        "factor per bullet, with the key numbers bolded (`**...**`). No headers, no tables, no "
        "nested sub-bullets.\n\n"
        "Respond with ONLY a JSON object matching this schema: "
        '{"decision": "BUY" | "HOLD" | "SELL", "confidence": <float 0.0-1.0>, "reasoning": <string>}.'
    )
    verdict: PMVerdict = llm.invoke(prompt)
    return {"decision": verdict.decision, "confidence": verdict.confidence, "rationale": verdict.reasoning}
