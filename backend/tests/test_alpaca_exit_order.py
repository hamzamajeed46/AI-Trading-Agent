from unittest.mock import MagicMock

from alpaca.trading.enums import TimeInForce

from integrations.alpaca_trading import AlpacaBroker


def _broker():
    broker = AlpacaBroker.__new__(AlpacaBroker)  # skip building a real client
    broker._client = MagicMock()
    broker._client.submit_order.return_value.id = "abc"
    return broker


def test_equity_exit_uses_day_time_in_force_so_fractional_qty_is_accepted():
    broker = _broker()
    assert broker.submit_market_order("BTC", 0.029, "sell") == "abc"
    request = broker._client.submit_order.call_args.args[0]
    assert request.time_in_force == TimeInForce.DAY
    assert request.qty == 0.029


def test_crypto_exit_uses_gtc():
    broker = _broker()
    broker.submit_market_order("BTC/USD", 0.01, "sell")
    assert broker._client.submit_order.call_args.args[0].time_in_force == TimeInForce.GTC
