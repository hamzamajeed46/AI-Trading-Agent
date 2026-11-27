from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    groq_api_key: str = ""
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    credential_encryption_key: str
    # Risk per trade = risk_per_trade_pct of account equity, capped at
    # risk_per_trade_cap_usd so a large account can't size an oversized trade.
    risk_per_trade_pct: float = 0.5
    risk_per_trade_cap_usd: float = 250.0

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")


settings = Settings()
