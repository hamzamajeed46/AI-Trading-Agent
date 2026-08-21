from pydantic import BaseModel, Field


class ConnectRequest(BaseModel):
    api_key: str
    secret_key: str
    mode: str = Field(default="paper", pattern="^(paper|live)$")


class StatusResponse(BaseModel):
    connected: bool
    mode: str | None = None
    provider: str | None = None
