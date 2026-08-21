from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.schemas.broker import ConnectRequest, StatusResponse
from db.models import User
from db.session import get_db
from services.broker_service import connect_broker, get_active_connection

router = APIRouter(prefix="/broker", tags=["broker"])


@router.post("/connect", response_model=StatusResponse)
def connect(
    payload: ConnectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StatusResponse:
    connection = connect_broker(db, current_user.id, payload.api_key, payload.secret_key, payload.mode)
    return StatusResponse(connected=True, mode=connection.mode, provider=connection.provider)


@router.get("/status", response_model=StatusResponse)
def status_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StatusResponse:
    connection = get_active_connection(db, current_user.id)
    if connection is None:
        return StatusResponse(connected=False)
    return StatusResponse(connected=True, mode=connection.mode, provider=connection.provider)
