from langchain_core.runnables import RunnableConfig

from graph.llm import get_llm, make_market_snapshot_tool, run_with_tools
from graph.state import SignalState


def bull_node(state: SignalState, config: RunnableConfig) -> dict:
    provider = config["configurable"]["market_data_provider"]
    symbol = state["symbol"]
    tool = make_market_snapshot_tool(provider, symbol)

    system_prompt = (
        f"You are the Bull analyst on an AI trading floor. Argue FOR buying/holding {symbol}. "
        "Use the market snapshot tool if you want fresher detail than the summary below. "
        "Respond in 3-5 short bullet points (markdown `-` list), one distinct point per bullet. "
        "Bold (`**...**`) the specific numbers/metrics each point turns on. No headers, no tables, "
        "no nested sub-bullets -- a single flat list."
    )
    rebut = f"\n\nRebut this bear argument directly: {state['bear_args'][-1]}" if state.get("bear_args") else ""
    user_prompt = f"Quant summary: {state['metrics']}. Price at call: {state['price_at_call']}.{rebut}"

    argument = run_with_tools(get_llm(), [tool], system_prompt, user_prompt)
    return {"bull_args": [argument], "round": state["round"] + 1}


def bear_node(state: SignalState, config: RunnableConfig) -> dict:
    provider = config["configurable"]["market_data_provider"]
    symbol = state["symbol"]
    tool = make_market_snapshot_tool(provider, symbol)

    system_prompt = (
        f"You are the Bear analyst on an AI trading floor. Argue AGAINST buying/holding {symbol}. "
        "Use the market snapshot tool if you want fresher detail than the summary below. "
        "Respond in 3-5 short bullet points (markdown `-` list), one distinct point per bullet. "
        "Bold (`**...**`) the specific numbers/metrics each point turns on. No headers, no tables, "
        "no nested sub-bullets -- a single flat list."
    )
    rebut = f"\n\nRebut this bull argument directly: {state['bull_args'][-1]}" if state.get("bull_args") else ""
    user_prompt = f"Quant summary: {state['metrics']}. Price at call: {state['price_at_call']}.{rebut}"

    argument = run_with_tools(get_llm(), [tool], system_prompt, user_prompt)
    return {"bear_args": [argument]}
