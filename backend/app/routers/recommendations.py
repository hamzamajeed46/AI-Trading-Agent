import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.deps import get_signal_graph
from app.errors import friendly_error_message
from app.schemas.recommendations import (
    AnalyzeResponse,
    RecommendationSummary,
    RespondRequest,
    StartRecommendationRequest,
)
from db.models import User
from db.session import get_db
from services.broker_service import NoBrokerConnectionError, build_provider_for_user
from services.signal_service import (
    RecommendationNotFoundError,
    RecommendationNotPendingError,
    list_recommendations,
    respond_to_recommendation,
    get_held_qty_for_user,
    run_signal_for_user,
    start_recommendation,
    stream_signal,
)

router = APIRouter(tags=["recommendations"])


@router.post("/analyze/{symbol}", response_model=AnalyzeResponse)
async def analyze(
    symbol: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    try:
        result = await asyncio.to_thread(run_signal_for_user, db, current_user.id, symbol)
    except NoBrokerConnectionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=friendly_error_message(exc))

    return {
        "symbol": result["symbol"],
        "asset_name": result["asset_name"],
        "price_at_call": result["price_at_call"],
        "metrics": result["metrics"],
        "rounds": result["round"],
        "bull_args": result["bull_args"],
        "bear_args": result["bear_args"],
        "decision": result["decision"],
        "confidence": result["confidence"],
        "rationale": result["rationale"],
    }


@router.post("/analyze/{symbol}/stream")
def analyze_stream(
    symbol: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    # Resolve the broker connection eagerly, before committing to a
    # StreamingResponse -- once we start streaming, the status code is
    # locked in at 200, so this is the only point where a missing
    # connection can still become a normal 400.
    try:
        provider = build_provider_for_user(db, current_user.id, symbol)
        held_qty = get_held_qty_for_user(db, current_user.id, symbol)
    except NoBrokerConnectionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    def event_generator():
        try:
            for update in stream_signal(provider, symbol, held_qty):
                yield json.dumps(update, default=str) + "\n"
        except Exception as exc:
            # Mid-stream failures (e.g. a Groq API error) can't become an
            # HTTP error status this late -- surface them as a JSON line
            # instead so the frontend can show something better than a
            # dropped connection. friendly_error_message keeps the raw
            # provider error (org ID, billing links, etc.) out of what the
            # user actually sees, while still logging it server-side.
            yield json.dumps({"error": friendly_error_message(exc)}) + "\n"

    # newline-delimited JSON: one node's output per line, not SSE framing --
    # there's no need for SSE's reconnect/event-id machinery for a single
    # one-shot streamed response.
    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


@router.post("/recommendations", response_model=RecommendationSummary)
async def create_recommendation(
    payload: StartRecommendationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    graph=Depends(get_signal_graph),
) -> dict:
    try:
        return await start_recommendation(graph, db, current_user.id, payload.symbol)
    except NoBrokerConnectionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=friendly_error_message(exc))


@router.get("/recommendations", response_model=list[RecommendationSummary])
async def list_recommendations_endpoint(
    status_filter: str | None = Query(default=None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    graph=Depends(get_signal_graph),
) -> list[dict]:
    return await list_recommendations(graph, db, current_user.id, status_filter)


async def _respond(
    graph, db: Session, user_id: str, thread_id: str, decision: str, note: str | None
) -> dict:
    try:
        return await respond_to_recommendation(graph, db, user_id, thread_id, decision, note)
    except RecommendationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except RecommendationNotPendingError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except NoBrokerConnectionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=friendly_error_message(exc))


@router.post("/recommendations/{thread_id}/approve", response_model=RecommendationSummary)
async def approve_recommendation(
    thread_id: str,
    payload: RespondRequest = RespondRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    graph=Depends(get_signal_graph),
) -> dict:
    return await _respond(graph, db, current_user.id, thread_id, "approve", payload.note)


@router.post("/recommendations/{thread_id}/reject", response_model=RecommendationSummary)
async def reject_recommendation(
    thread_id: str,
    payload: RespondRequest = RespondRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    graph=Depends(get_signal_graph),
) -> dict:
    return await _respond(graph, db, current_user.id, thread_id, "reject", payload.note)
