from unittest.mock import MagicMock

import pytest

from graph.nodes import pm as pm_module
from graph.nodes.execution import execution_node
from graph.nodes.pm import enforce_position_rules, pm_node
from graph.signal_graph import route_after_pm


@pytest.mark.parametrize(
    "decision,held,expected",
    [
        ("SELL", 0, "AVOID"),  # bearish but nothing to sell -> avoid, never a short
        ("SELL", 10, "SELL"),  # held: a real exit
        ("AVOID", 10, "SELL"),  # held: bearish means exit
        ("AVOID", 0, "AVOID"),
        ("BUY", 0, "BUY"),
        ("BUY", 10, "BUY"),
        ("HOLD", 0, "HOLD"),
        ("HOLD", 10, "HOLD"),
    ],
)
def test_enforce_position_rules(decision, held, expected):
    assert enforce_position_rules(decision, held) == expected


class _FakeLLM:
    def __init__(self, verdict):
        self.verdict = verdict
        self.prompt = None

    def with_structured_output(self, *a, **k):
        return self

    def invoke(self, prompt):
        self.prompt = prompt
        return self.verdict


def _pm_state(held):
    return {"symbol": "NVDA", "metrics": {}, "price_at_call": 100.0, "bull_args": [], "bear_args": [], "held_qty": held}


def test_pm_unheld_sell_becomes_avoid_and_prompt_forbids_sell(monkeypatch):
    fake = _FakeLLM(pm_module.PMVerdict(decision="SELL", confidence=0.8, reasoning="- bearish"))
    monkeypatch.setattr(pm_module, "get_llm", lambda **k: fake)
    out = pm_node(_pm_state(0), {})
    assert out["decision"] == "AVOID"
    assert "does NOT own" in fake.prompt and "Never answer SELL" in fake.prompt


def test_pm_held_prompt_mentions_holding_and_allows_sell(monkeypatch):
    fake = _FakeLLM(pm_module.PMVerdict(decision="SELL", confidence=0.8, reasoning="- exit"))
    monkeypatch.setattr(pm_module, "get_llm", lambda **k: fake)
    out = pm_node(_pm_state(25), {})
    assert out["decision"] == "SELL"
    assert "HOLDS 25 shares" in fake.prompt


@pytest.mark.parametrize("decision,expected", [("HOLD", "end"), ("AVOID", "end"), ("BUY", "risk"), ("SELL", "risk")])
def test_route_after_pm(decision, expected):
    state = {"symbol": "AAPL", "decision": decision, "confidence": 0.9, "round": 1}
    assert route_after_pm(state) == expected


def _exec_cfg():
    broker = MagicMock()
    broker.submit_market_order.return_value = "order-1"
    broker.submit_bracket_order.return_value = "order-2"
    broker.get_held_qty.return_value = 5
    db = MagicMock()
    return {"configurable": {"broker": broker, "db": db, "user_id": 1}}, broker, db


def _exec_state(decision):
    return {
        "symbol": "AAPL",
        "decision": decision,
        "human_decision": "approve",
        "recommendation_id": "r1",
        "proposed_qty": 5,
        "stop_price": None if decision == "SELL" else 90.0,
        "take_profit_price": None if decision == "SELL" else 120.0,
    }


def test_approved_sell_submits_market_exit_and_opens_no_position():
    cfg, broker, db = _exec_cfg()
    out = execution_node(_exec_state("SELL"), cfg)
    broker.submit_market_order.assert_called_once_with(symbol="AAPL", qty=5, side="sell")
    broker.submit_bracket_order.assert_not_called()
    assert out["execution_status"] == "submitted"
    added = [type(c.args[0]).__name__ for c in db.add.call_args_list]
    assert added == ["Order"]  # no Position row for an exit


def test_approved_buy_still_uses_bracket_and_opens_position():
    cfg, broker, db = _exec_cfg()
    execution_node(_exec_state("BUY"), cfg)
    broker.submit_bracket_order.assert_called_once()
    broker.submit_market_order.assert_not_called()
    added = [type(c.args[0]).__name__ for c in db.add.call_args_list]
    assert added == ["Order", "Position"]


def test_approved_sell_refused_when_shares_no_longer_held():
    cfg, broker, db = _exec_cfg()
    broker.get_held_qty.return_value = 0
    out = execution_node(_exec_state("SELL"), cfg)
    broker.submit_market_order.assert_not_called()
    assert out["execution_status"] == "failed"
    assert "nothing to sell" in out["execution_error"]


def test_approved_sell_is_capped_at_held_quantity():
    cfg, broker, db = _exec_cfg()
    broker.get_held_qty.return_value = 3  # proposed 5, only 3 held
    execution_node(_exec_state("SELL"), cfg)
    broker.submit_market_order.assert_called_once_with(symbol="AAPL", qty=3, side="sell")
