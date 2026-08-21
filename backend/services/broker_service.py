from sqlalchemy.orm import Session

from db.models import BrokerConnection
from graph.providers import MarketDataProvider, is_crypto_symbol
from integrations.alpaca_market_data import AlpacaCryptoMarketDataProvider, AlpacaMarketDataProvider
from integrations.alpaca_trading import AlpacaBroker
from integrations.crypto import decrypt, encrypt


class NoBrokerConnectionError(Exception):
    pass


def connect_broker(db: Session, user_id: str, api_key: str, secret_key: str, mode: str) -> BrokerConnection:
    db.query(BrokerConnection).filter(
        BrokerConnection.user_id == user_id,
        BrokerConnection.is_active.is_(True),
    ).update({"is_active": False})

    connection = BrokerConnection(
        user_id=user_id,
        provider="alpaca",
        mode=mode,
        api_key_encrypted=encrypt(api_key),
        secret_key_encrypted=encrypt(secret_key),
        is_active=True,
    )
    db.add(connection)
    db.commit()
    return connection


def get_active_connection(db: Session, user_id: str) -> BrokerConnection | None:
    return (
        db.query(BrokerConnection)
        .filter(BrokerConnection.user_id == user_id, BrokerConnection.is_active.is_(True))
        .first()
    )


def build_provider_for_user(db: Session, user_id: str, symbol: str) -> MarketDataProvider:
    """Alpaca splits market data into separate equity/crypto REST namespaces
    -- which concrete provider gets built depends on the symbol's shape, not
    the user's broker connection (one Alpaca account covers both)."""
    connection = get_active_connection(db, user_id)
    if connection is None:
        raise NoBrokerConnectionError(
            f"User {user_id} has no active broker connection. Connect one via POST /broker/connect first."
        )
    api_key = decrypt(connection.api_key_encrypted)
    secret_key = decrypt(connection.secret_key_encrypted)
    if is_crypto_symbol(symbol):
        return AlpacaCryptoMarketDataProvider(api_key=api_key, secret_key=secret_key)
    return AlpacaMarketDataProvider(api_key=api_key, secret_key=secret_key)


def build_broker_for_user(db: Session, user_id: str) -> AlpacaBroker:
    connection = get_active_connection(db, user_id)
    if connection is None:
        raise NoBrokerConnectionError(
            f"User {user_id} has no active broker connection. Connect one via POST /broker/connect first."
        )
    api_key = decrypt(connection.api_key_encrypted)
    secret_key = decrypt(connection.secret_key_encrypted)
    return AlpacaBroker(api_key=api_key, secret_key=secret_key, paper=(connection.mode != "live"))
