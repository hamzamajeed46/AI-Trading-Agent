from unittest.mock import MagicMock

import pytest
from langchain_core.exceptions import OutputParserException

from graph.nodes import pm as pm_module
from graph.nodes.risk import risk_node
from graph.nodes.pm import pm_node
from graph.validation import InvalidRecommendationError


def _state(decision="BUY"):
    return {
        "symbol": "AAPL",
        "price_at_call": 100.0,
        "metrics": {"volatility_pct": 20.0},
        "decision": decision,
        "confidence": 0.8,
        "rationale": "x",
        "round": 1,
    }


def _config(buying_power, equity=100_000):
    broker = MagicMock()
    broker.get_buying_power.return_value = buying_power
    broker.get_equity.return_value = equity
    db = MagicMock()
    return {"configurable": {"broker": broker, "db": db, "user_id": 1, "thread_id": "t"}}, db


def test_risk_node_valid_buy_writes_row_and_levels_are_ordered():
    cfg, db = _config(100_000)
    out = risk_node(_state("BUY"), cfg)
    assert out["stop_price"] < out["entry_price_hint"] < out["take_profit_price"]
    assert out["proposed_qty"] > 0
    db.add.assert_called_once()


def test_risk_node_valid_sell_levels_are_mirrored():
    cfg, _ = _config(100_000)
    out = risk_node(_state("SELL"), cfg)
    assert out["take_profit_price"] < out["entry_price_hint"] < out["stop_price"]


def test_risk_node_zero_qty_blocked_before_ledger_write():
    cfg, db = _config(0)  # no buying power -> qty 0
    with pytest.raises(InvalidRecommendationError):
        risk_node(_state("BUY"), cfg)
    db.add.assert_not_called()


class _FakeLLM:
    def __init__(self, results):
        self.results = list(results)
        self.calls = 0

    def with_structured_output(self, *a, **k):
        return self

    def invoke(self, prompt):
        self.calls += 1
        r = self.results.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def _pm_state():
    return {"symbol": "AAPL", "metrics": {}, "price_at_call": 100.0, "bull_args": [], "bear_args": []}


def test_pm_retries_once_then_succeeds(monkeypatch):
    good = pm_module.PMVerdict(decision="BUY", confidence=0.8, reasoning="- ok")
    fake = _FakeLLM([OutputParserException("bad json"), good])
    monkeypatch.setattr(pm_module, "get_llm", lambda **k: fake)
    out = pm_node(_pm_state(), {})
    assert out["decision"] == "BUY" and fake.calls == 2


def test_pm_fails_after_second_bad_output(monkeypatch):
    fake = _FakeLLM([OutputParserException("a"), OutputParserException("b")])
    monkeypatch.setattr(pm_module, "get_llm", lambda **k: fake)
    with pytest.raises(OutputParserException):
        pm_node(_pm_state(), {})
    assert fake.calls == 2


def test_risk_budget_is_pct_of_equity_below_cap():
    from graph.nodes.risk import compute_risk_budget

    assert compute_risk_budget(10_000) == pytest.approx(50.0)  # 0.5% of $10k


def test_risk_budget_is_capped_for_large_accounts():
    from graph.nodes.risk import compute_risk_budget

    assert compute_risk_budget(10_000_000) == 250.0  # 0.5% would be $50k; cap wins


def test_small_account_gets_smaller_position_than_large_account():
    small_cfg, _ = _config(buying_power=1_000_000, equity=10_000)
    large_cfg, _ = _config(buying_power=1_000_000, equity=100_000)
    small = risk_node(_state("BUY"), small_cfg)["proposed_qty"]
    large = risk_node(_state("BUY"), large_cfg)["proposed_qty"]
    assert 0 < small < large


def test_zero_equity_blocked_before_ledger_write():
    cfg, db = _config(buying_power=100_000, equity=0)
    with pytest.raises(InvalidRecommendationError):
        risk_node(_state("BUY"), cfg)
    db.add.assert_not_called()
