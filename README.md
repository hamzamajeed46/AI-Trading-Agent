# AI Trading Agent (learning project)

Multi-agent LangGraph trading agent with human-in-the-loop approval, backed by FastAPI,
Postgres, and a Next.js dashboard, built in phases. See [`PLAN.md`](PLAN.md) for the full plan.

## Setup

1. Create a free Alpaca paper-trading account (**Trading API**, not Broker API) at
   https://alpaca.markets and generate paper API keys.
2. Get a Groq Cloud API key at https://console.groq.com.
3. Postgres must be installed and running locally. Create the project database (see
   "Postgres setup" in `PLAN.md`).
4. `cd backend`, copy `.env.example` to `.env`, fill in `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`,
   `GROQ_API_KEY`, `DATABASE_URL`. Generate `JWT_SECRET` (`python -c "import secrets; print(secrets.token_hex(32))"`)
   and `CREDENTIAL_ENCRYPTION_KEY` (`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`).
5. Dependencies are managed with [uv](https://docs.astral.sh/uv/). From `backend/`: `uv sync`
   (creates `.venv` and installs everything from `pyproject.toml`/`uv.lock`). Run any command
   with `uv run <command>` — e.g. `uv run python scripts/smoke_test.py`, `uv run alembic upgrade head`,
   `uv run uvicorn app.main:app --reload --port 8000`. No manual venv activation needed.

## Phase 0 — connectivity smoke test

```
cd backend
uv run python scripts/smoke_test.py
```

Prints your paper account's buying power and 5 recent AAPL daily bars.

## Phase 1 — Postgres + auth + broker connections

```
cd backend
uv run alembic upgrade head          # creates all tables
uv run uvicorn app.main:app --reload --port 8000
```

Then `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`, `POST /broker/connect` (with your
Alpaca keys), `GET /broker/status`. Interactive docs at http://localhost:8000/docs.

## Status

Phases 0-5 done (Phase 5 = human-in-the-loop approvals with Postgres-persisted graph state). See
`PLAN.md` for the full phased build order (0-9); Phase 6 (live streaming + WebSocket) is next.
