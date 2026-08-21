import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from db.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    phone_number = Column(String, nullable=True)
    country = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    broker_connections = relationship(
        "BrokerConnection", back_populates="user", cascade="all, delete-orphan"
    )


class BrokerConnection(Base):
    __tablename__ = "broker_connections"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String, nullable=False, default="alpaca")
    mode = Column(String, nullable=False)  # "paper" | "live"
    api_key_encrypted = Column(Text, nullable=False)
    secret_key_encrypted = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="broker_connections")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    thread_id = Column(String, nullable=False, index=True)
    symbol = Column(String, nullable=False)
    round = Column(Integer, nullable=False, default=0)
    decision = Column(String, nullable=False)  # BUY | HOLD | SELL
    confidence = Column(Float, nullable=False)
    rationale = Column(Text)
    metrics_json = Column(JSON)
    mode = Column(String, nullable=False, default="live")  # live | backtest
    status = Column(String, nullable=False, default="pending_approval")
    backtest_run_id = Column(UUID(as_uuid=False), ForeignKey("backtest_runs.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    recommendation_id = Column(
        UUID(as_uuid=False), ForeignKey("recommendations.id"), nullable=False, index=True
    )
    decision = Column(String, nullable=False)  # approve | reject
    responded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    note = Column(Text)


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    recommendation_id = Column(
        UUID(as_uuid=False), ForeignKey("recommendations.id"), nullable=False, index=True
    )
    alpaca_order_id = Column(String)
    side = Column(String, nullable=False)
    qty = Column(Float, nullable=False)
    order_class = Column(String, nullable=False, default="bracket")
    stop_price = Column(Float)
    take_profit_price = Column(Float)
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(String, nullable=False, default="submitted")
    mode = Column(String, nullable=False, default="live")
    backtest_run_id = Column(UUID(as_uuid=False), ForeignKey("backtest_runs.id"), nullable=True)


class Position(Base):
    __tablename__ = "positions"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    symbol = Column(String, nullable=False)
    entry_order_id = Column(UUID(as_uuid=False), ForeignKey("orders.id"))
    opened_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    closed_at = Column(DateTime)
    exit_reason = Column(String)  # stop_hit | take_profit_hit | model_exit | manual
    realized_pnl = Column(Float)
    recommended_timeline = Column(String)
    mode = Column(String, nullable=False, default="live")
    backtest_run_id = Column(UUID(as_uuid=False), ForeignKey("backtest_runs.id"), nullable=True)


class PositionEvent(Base):
    __tablename__ = "position_events"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    position_id = Column(UUID(as_uuid=False), ForeignKey("positions.id"), nullable=False, index=True)
    event_type = Column(String, nullable=False)  # timeline_reminder | model_review_flag | stop_updated | fill
    payload_json = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class BacktestRun(Base):
    __tablename__ = "backtest_runs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    params_json = Column(JSON)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    finished_at = Column(DateTime)
    summary_metrics_json = Column(JSON)
