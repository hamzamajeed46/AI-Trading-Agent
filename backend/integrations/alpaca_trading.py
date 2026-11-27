import os

from alpaca.trading.client import TradingClient
from alpaca.trading.enums import OrderClass, OrderSide, TimeInForce
from alpaca.trading.requests import MarketOrderRequest, StopLossRequest, TakeProfitRequest

from graph.providers import is_crypto_symbol


def get_trading_client() -> TradingClient:
    return TradingClient(
        api_key=os.environ["ALPACA_API_KEY"],
        secret_key=os.environ["ALPACA_SECRET_KEY"],
        paper=True,
    )


def get_account_summary() -> dict:
    account = get_trading_client().get_account()
    return {
        "status": account.status,
        "buying_power": account.buying_power,
        "cash": account.cash,
        "portfolio_value": account.portfolio_value,
    }


class AlpacaBroker:
    """graph.providers.Broker implementation scoped to one user's own Alpaca
    credentials -- nodes only ever see this, never raw keys. `paper` follows
    the user's BrokerConnection.mode ("paper" vs "live"), since this is the
    client that actually places orders."""

    def __init__(self, api_key: str, secret_key: str, paper: bool = True) -> None:
        self._client = TradingClient(api_key=api_key, secret_key=secret_key, paper=paper)

    def submit_bracket_order(
        self, symbol: str, qty: float, side: str, stop_price: float, take_profit_price: float
    ) -> str:
        # Prices/qty arrive already rounded to the right precision for the
        # asset class (graph/nodes/risk.py) -- don't re-round to a fixed 2
        # decimals here, that would clobber crypto's finer qty/price precision.
        order_side = OrderSide.BUY if side == "buy" else OrderSide.SELL

        if is_crypto_symbol(symbol):
            # Confirmed live against Alpaca's paper API: bracket orders are
            # rejected outright for crypto ("crypto orders not allowed for
            # advanced order_class: otoco" -- a bracket IS an OTOCO order
            # under the hood). Fall back to a plain market order; stop_price/
            # take_profit_price stay purely informational for crypto (still
            # recorded on the Order row) since there's no broker-enforced
            # exit -- graph/nodes/execution.py records order_class="market"
            # for this case so that's visible in the ledger.
            request = MarketOrderRequest(
                symbol=symbol, qty=qty, side=order_side, time_in_force=TimeInForce.GTC
            )
        else:
            request = MarketOrderRequest(
                symbol=symbol,
                qty=qty,
                side=order_side,
                time_in_force=TimeInForce.GTC,
                order_class=OrderClass.BRACKET,
                take_profit=TakeProfitRequest(limit_price=take_profit_price),
                stop_loss=StopLossRequest(stop_price=stop_price),
            )
        order = self._client.submit_order(request)
        return str(order.id)

    def get_position(self, symbol: str):
        try:
            return self._client.get_open_position(symbol)
        except Exception:
            return None

    def close_position(self, symbol: str) -> None:
        self._client.close_position(symbol)

    def get_buying_power(self) -> float:
        return float(self._client.get_account().buying_power)

    def get_held_qty(self, symbol: str) -> float:
        """Shares of `symbol` held long (0.0 if none or a short position).
        Crypto positions are keyed without the slash ("BTCUSD")."""
        position = self.get_position(symbol.replace("/", ""))
        if position is None:
            return 0.0
        return max(float(position.qty), 0.0)

    def submit_market_order(self, symbol: str, qty: float, side: str) -> str:
        """Plain market order, no bracket -- used for exits of shares the user holds."""
        # Alpaca accepts fractional equity orders only as DAY orders, while
        # crypto accepts GTC but not DAY -- so the time-in-force depends on the
        # asset class (an exit may be a fractional share count).
        time_in_force = TimeInForce.GTC if is_crypto_symbol(symbol) else TimeInForce.DAY
        request = MarketOrderRequest(
            symbol=symbol,
            qty=qty,
            side=OrderSide.BUY if side == "buy" else OrderSide.SELL,
            time_in_force=time_in_force,
        )
        return str(self._client.submit_order(request).id)

    def get_equity(self) -> float:
        return float(self._client.get_account().equity)
