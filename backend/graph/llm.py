from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_groq import ChatGroq

from app.config import settings
from graph.providers import MarketDataProvider


def get_llm(temperature: float = 0.4) -> ChatGroq:
    return ChatGroq(model="openai/gpt-oss-120b", api_key=settings.groq_api_key, temperature=temperature)


def make_market_snapshot_tool(provider: MarketDataProvider, symbol: str):
    @tool
    def get_market_snapshot() -> dict:
        """Fetch a fresh snapshot of recent daily closes and the latest bid/ask quote."""
        # quant_node already treats a get_bars failure as recoverable (falls
        # back to empty metrics) -- this tool call didn't have the same
        # protection, so any transient Alpaca hiccup here crashed the whole
        # multi-round debate instead of just this one tool call. Degrade the
        # same way: hand the LLM an error string it can reason around instead
        # of an unhandled exception that kills the graph run.
        try:
            bars = provider.get_bars(symbol, lookback_days=10)
            quote = provider.get_latest_quote(symbol)
        except Exception as exc:
            return {"error": f"market data temporarily unavailable for {symbol}: {exc}"}
        return {
            "recent_closes": [round(b.close, 2) for b in bars[-5:]],
            "latest_bid": quote.bid_price,
            "latest_ask": quote.ask_price,
        }

    return get_market_snapshot


def run_with_tools(
    llm: ChatGroq,
    tools: list,
    system_prompt: str,
    user_prompt: str,
    max_tool_iters: int = 2,
) -> str:
    """Hand-written tool-calling loop (bind -> invoke -> execute requested
    tool calls -> re-invoke with ToolMessages -> repeat) rather than a
    prebuilt agent, so the tool-call contract stays visible."""
    llm_with_tools = llm.bind_tools(tools)
    tools_by_name = {t.name: t for t in tools}
    messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]

    for _ in range(max_tool_iters):
        response = llm_with_tools.invoke(messages)
        messages.append(response)
        if not response.tool_calls:
            return response.content
        for call in response.tool_calls:
            tool_fn = tools_by_name[call["name"]]
            result = tool_fn.invoke(call["args"])
            messages.append(ToolMessage(content=str(result), tool_call_id=call["id"]))

    final = llm_with_tools.invoke(messages)
    return final.content
