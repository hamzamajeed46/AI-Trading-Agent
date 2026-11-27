# AI Trading Agent with Human-in-the-Loop Execution (LangGraph + FastAPI + Alpaca + Postgres + Next.js)

## Context

This started as a small "practice multi-agent systems" exercise (LangGraph bull/bear/quant/PM debate producing a BUY/HOLD/SELL call). It grew in three steps as the conversation went on:

1. Expanded to the full **"AI Trading Agent with Human-in-the-Loop Execution"** vision — FastAPI backend, live WebSocket market data, a human approval gate before any order, post-entry trade lifecycle management, audit logging, and a backtesting module — with **Alpaca Markets** (`alpaca-py`) replacing yfinance for both market data and paper-trading execution.
2. Added a **Next.js dashboard** as the real UI for the human-in-the-loop approval surface (plus live view, positions, and backtest results), not just a bare test page.
3. Clarified that **real-money trading requires each user to connect their own Alpaca account** (API keys are tied to one brokerage account's funds — there's no way to place a real trade on someone's behalf without their own credentials). This makes the project genuinely multi-tenant: real signup/login auth, encrypted per-user broker credentials, and a Postgres database (SQLAlchemy + Alembic) instead of a single-user SQLite ledger.

The original debate-graph design is not discarded — it's still the "signal generation" core, now wired to per-user credentials instead of global env vars.

**Confirmed scope decisions:** build real auth now (not stubbed) — signup/login with password hashing + JWT; Postgres via the **local install already present on this machine** (v18.4, running as a Windows service at `C:\Program Files\PostgreSQL\18`), not Docker.

**Prerequisite the user must handle outside this plan:** a free Alpaca paper-trading account + API keys (used for your own dev/test connection in Phase 0 and as the first broker connection you add through the app in Phase 1+); a Groq Cloud API key. Postgres itself is already installed — Phase 1 includes the exact commands to create the project's database and role (run by the user in their own terminal, since it needs the local `postgres` superuser password, which stays local and isn't shared in this chat).

**Project location & layout:** `e:\Test\trading-agent\`, split into top-level `backend/` (FastAPI + LangGraph + Postgres) and `frontend/` (Next.js).

**Working agreement:** build and confirm one phase at a time — do not start the next phase until explicitly told to.

## Confirmed technical decisions

- **LangGraph** 1.x, `interrupt()` + `Command(resume=...)` for human-in-the-loop. Same `thread_id` required across pause/resume; checkpointer persists across process restarts.
- **Alpaca**: `alpaca-py` SDK. `TradingClient(paper=True/False)` for orders/positions, `StockHistoricalDataClient` for bars, `StockDataStream`/`TradingStream` for live streaming. Bracket orders handle stop-loss/take-profit server-side.
- **Groq** (`langchain-groq`, `openai/gpt-oss-120b`) for bull/bear/PM reasoning. (`llama-3.3-70b-versatile`, the originally planned model, is no longer offered on Groq's current lineup — see Phase 3's notes for the swap and for why PM's structured output uses `method="json_mode"` rather than the default forced-tool-call method.)
- **Postgres 18** (local install) + **SQLAlchemy** ORM + **Alembic** migrations — replaces the earlier plain-SQLite-ledger design entirely.
- **Auth**: real signup/login. Password hashing via `bcrypt`. JWT access tokens (via `pyjwt`) returned as `access_token` in the login response body; validated per-request via an `Authorization: Bearer` header through `fastapi.security.HTTPBearer` (registered as an OpenAPI security scheme, so `/docs` gets one global "Authorize" padlock covering every protected endpoint). No cookie-based session — simpler for testing/multiple client types, at the cost of the frontend needing to store the token itself (Phase 2, see below) instead of getting httpOnly XSS protection for free. No refresh-token rotation for MVP either (flagged as a simplification, not a production-grade session system). No `/auth/logout` — a stateless Bearer token has nothing server-side to invalidate; "logging out" is just the client discarding the token.
- **Per-user broker credentials**: each user's Alpaca API key/secret is encrypted at rest with `cryptography.Fernet`, keyed by an app-level `CREDENTIAL_ENCRYPTION_KEY` in the backend `.env`. Explicitly not real production key-custody (that would be a KMS/HSM) — good enough for a learning project, and worth being upfront about if described elsewhere (e.g. in an interview).
- FastAPI with **async** graph/checkpointer calls throughout; sync Alpaca SDK / DB calls wrapped in `asyncio.to_thread` where needed.
- **Regulatory framing** (for any write-up of this project): the app connects to *the user's own* funded/paper Alpaca account — it never pools or manages other people's money — which avoids broker-dealer/investment-adviser licensing questions that a "trades on your behalf with pooled funds" framing would raise.



## Architecture



### Design seam: provider/broker interfaces (unchanged principle, now per-user)

`graph/providers.py` defines abstract `MarketDataProvider` and `Broker`. Live code builds these **per-user** via `services/broker_service.py::build_provider_for_user(db, user_id)` (the equivalent `build_broker_for_user` lands in Phase 5) — it looks up that user's active `BrokerConnection` row, decrypts the credentials, and constructs an Alpaca client scoped to them. Backtest code implements the same interfaces against historical replay + a simulated fill engine. **Nodes never import Alpaca directly** and never see raw credentials — they receive an already-constructed provider/broker via `config["configurable"]`.

### Multi-tenancy & auth

- `User(id, email, hashed_password, first_name, last_name, phone_number [nullable], country, created_at)` — profile fields added post-Phase-1 so signup collects who's trading and from where; `phone_number` is the only optional one.
- `BrokerConnection(id, user_id FK, provider="alpaca", mode["paper"|"live"], api_key_encrypted, secret_key_encrypted, is_active, created_at)` — a user can have more than one row (schema allows it) but MVP keeps exactly one active connection per user.
- Auth endpoints: `POST /auth/signup`, `POST /auth/login` (returns `access_token`/`token_type` in the body), `GET /auth/me`.
- `app/auth/dependencies.py::get_current_user` — FastAPI dependency reading the `Authorization: Bearer` header (via `HTTPBearer`), decoding the JWT, loading the `User` row; every recommendation/position/backtest/broker route depends on it and scopes its query by `user_id`.
- Frontend token storage: the Next.js app stores the returned `access_token` client-side (Phase 2) and attaches it as `Authorization: Bearer <token>` on every API call via `lib/api.ts` — flagged in "Deliberate simplifications" below, since this is less XSS-resistant than an httpOnly cookie would have been.
- Broker connection endpoints: `POST /broker/connect` (accepts API key/secret + mode, encrypts, stores), `GET /broker/status` (whether a connection exists, which mode, never returns the raw secret back).



### File layout

```
e:\Test\trading-agent\
  backend/
    app/
      main.py                    # FastAPI app, CORS for the Next.js dev origin, startup hooks
      config.py                  # env/settings: DATABASE_URL, GROQ_*, JWT secret, CREDENTIAL_ENCRYPTION_KEY, thresholds
      deps.py                    # get_db, compiled graph singleton, checkpointer
      auth/
        security.py              # bcrypt hash/verify, JWT encode/decode
        dependencies.py          # get_current_user
      schemas/
        auth.py                  # SignupRequest, LoginRequest, UserOut
        broker.py                 # ConnectRequest, StatusResponse
      routers/
        auth.py                  # signup/login/logout/me
        broker.py                 # connect/status
        recommendations.py       # POST /recommendations, /{thread_id}/approve, /reject, GET listing
        positions.py             # GET /positions, GET /positions/{id}/events
        ws.py                    # /ws/stream
        backtest.py              # POST /backtest/run, GET /backtest/{run_id}/metrics
    graph/
      state.py
      signal_graph.py
      providers.py                # MarketDataProvider / Broker interfaces
      nodes/
        quant.py
        debate.py                # bull_node, bear_node
        pm.py
        risk.py
        human_approval.py        # interrupt() ONLY
        execution.py
    integrations/
      alpaca_market_data.py       # AlpacaMarketDataProvider -- ONLY "how to talk to Alpaca," no DB/business logic
      alpaca_trading.py           # AlpacaBroker (per-user instantiation)
      crypto.py                   # Fernet encrypt/decrypt for stored broker credentials
    services/
      auth_service.py             # signup_user, authenticate_user -- routers/auth.py just translates exceptions to HTTP
      broker_service.py           # connect_broker, get_active_connection, build_provider_for_user (DB lookup + decrypt)
      signal_service.py           # run_signal_for_user -- shared by scripts/run_signal.py AND the Phase 4 HTTP endpoint
    backtest/
      replay_provider.py
      simulated_broker.py
      simulator.py
      runner.py
      metrics.py
    lifecycle/
      monitor.py
    db/
      session.py                  # engine, SessionLocal, get_db
      models.py                   # User, BrokerConnection, Recommendation, Approval, Order, Position, PositionEvent, BacktestRun
      repository.py               # query helpers shared by nodes/routers/monitor/backtest
    alembic/
      env.py
      versions/
    alembic.ini
    static/
      client.html                 # bare WS sanity-check page (backend debugging only)
    scripts/
      run_signal.py                # authenticated-by-user-id CLI entry point for local testing
    pyproject.toml               # deps managed via uv (`uv sync`, `uv run <cmd>`)
    uv.lock
    .env.example
  frontend/
    app/
      login/page.tsx               # added Phase 2
      signup/page.tsx              # added Phase 2
      broker/page.tsx              # added Phase 2 — connect Alpaca account (API key/secret + mode)
      analyze/page.tsx             # added Phase 4 — trigger POST /analyze/{symbol}, show the result
      approvals/page.tsx           # added Phase 5 — pending recommendations, approve/reject (core HITL surface)
      live/page.tsx                # added Phase 11 — WS live view (node progress, bar ticks, awaiting_approval)
      positions/page.tsx           # added Phase 12
      ideas/page.tsx               # added Phase 9 — daily top ideas from the scanner
      performance/page.tsx         # added Phase 10 — user's own trading stats
      bots/page.tsx                # added Phase 13 — autonomous bot rules, status, pause/kill
      backtest/page.tsx            # added Phase 8
      layout.tsx
    lib/
      api.ts                       # fetch client attaching `Authorization: Bearer <token>` from stored token
      ws.ts                        # WebSocket hook for /ws/stream
    package.json
  README.md
  PLAN.md
  .gitignore
```

### Layering convention: routers → services → integrations/db

Added when `services/` was introduced (post-Phase-3 cleanup) after routers had started accumulating DB queries and business rules directly in the endpoint function. The rule going forward: **routers only parse the request, call a service function, and translate that service's exceptions into an `HTTPException`** — they don't touch `db.query(...)` or external clients directly. **Services** hold the actual business logic (e.g. "reject a duplicate email," "deactivate the old broker connection before creating a new one") and are the only layer that calls both `db/models.py` and `integrations/`. **Integrations** stay dumb — `AlpacaMarketDataProvider` only knows how to call Alpaca, it doesn't know what a `User` is. This is also why `services/signal_service.py::run_signal_for_user` exists: it's the one place that owns "look up this user's provider, build the graph, invoke it," so Phase 4's HTTP endpoint can call the exact same function `scripts/run_signal.py` already does instead of duplicating that orchestration.



### State schema (`graph/state.py`)

`symbol`, `metrics`, `bull_argument`, `bear_argument`, `round` (`Annotated[list[str], operator.add]`), `decision`, `confidence`, `rationale`, `proposed_qty`, `entry_price_hint`, `stop_price`, `take_profit_price`, `recommended_timeline`, `human_decision`, `order_id`, `execution_status`, `mode` (`"live"`/`"backtest"`). `user_id` lives in the LangGraph `config`, not graph state, alongside `thread_id`.

### Graph flow

```
START -> quant_node -> bull_node -> bear_node -> pm_node
pm_node --[low confidence, round<3]--> bull_node   (loop)
pm_node --[confident, non-HOLD]--> risk_node -> human_approval_node -> execution_node -> END
pm_node --[confident, HOLD]--> END
```

`human_approval_node` must contain nothing but the `interrupt()` call — the ledger write for "pending approval" belongs in `risk_node`, since only the interrupting node re-executes on resume.

### Database (Postgres + SQLAlchemy + Alembic)

All ledger tables from the earlier SQLite design carry over as SQLAlchemy models, gaining `user_id` FKs:

- `users`, `broker_connections` (new, described above).
- `recommendations(id, user_id, thread_id, symbol, round, decision, confidence, rationale, metrics_json, mode, status, created_at)`.
- `approvals(recommendation_id, decision, responded_at, note)`.
- `orders(recommendation_id, alpaca_order_id, side, qty, order_class, stop_price, take_profit_price, submitted_at, status, mode, backtest_run_id)`.
- `positions(user_id, symbol, entry_order_id, opened_at, closed_at, exit_reason, realized_pnl, recommended_timeline, mode, backtest_run_id)`.
- `position_events(position_id, event_type, payload_json, created_at)`.
- `backtest_runs(user_id, params_json, started_at, finished_at, summary_metrics_json)`.

Alembic manages schema migrations from the start (first migration creates all tables); no hand-written `CREATE TABLE` anywhere.

### Trade lifecycle, backtesting, WebSocket contents

Unchanged in design from before, just user-scoped throughout:

- Lifecycle monitoring is a background asyncio task (`TradingStream` fill listener + timeline reminder + periodic model-driven re-review), not a second graph — Alpaca's bracket orders already handle the mechanical stop/take-profit.
- Backtesting reuses the exact same graph/nodes via `HistoricalReplayProvider` + `SimulatedBroker` swapped in through `config["configurable"]`; auto-resolves `interrupt()` with a configurable policy since there's no human during a backtest run.
- `/ws/stream` forwards node-progress, `awaiting_approval`, live bar ticks, and position events as typed JSON messages; the Next.js dashboard is the real client, `static/client.html` stays as a zero-dependency backend debugging aid.



## Phased build order (build and verify each phase before starting the next — wait for explicit go-ahead between phases)

- [x] **Phase 0 — Environment smoke tests.** Alpaca connectivity (`get_account()` + 5 bars, using your own dev keys directly from `.env` — no per-user storage yet, this is a throwaway sanity check) + confirm the local Postgres install is reachable. *Status: DONE for Alpaca —* `scripts/smoke_test.py` *prints paper account status (buying power $400k, cash $100k) and the last 5 real AAPL daily bars. Fixed a bug along the way:* `StockBarsRequest.limit` *truncates from the start of the date range, not the end, so getting the most recent N bars requires fetching a wide-enough window and slicing the tail in Python (see* `integrations/alpaca_market_data.py`*). Postgres reachability check + moving these files into* `backend/` *happens as part of Phase 1's reorg.*

- [x] **Phase 1 — Postgres + Auth + multi-tenant broker credentials.** Reorg existing files into `backend/`; `db/{session,models}.py`; Alembic init + first migration (users, broker_connections, and the rest of the ledger tables); `app/auth/{security,dependencies}.py`; `routers/auth.py` (signup/login/logout/me); `integrations/crypto.py` (Fernet); `routers/broker.py` (connect/status). *Status: DONE.* All 8 tables created via `alembic upgrade head` against the local Postgres DB. Verified end-to-end with curl: signup → login (httpOnly JWT cookie set) → `GET /auth/me` returns the user; a request with no cookie gets 401; `POST /broker/connect` with real Alpaca paper keys stores them and `GET /broker/status` confirms connection without echoing secrets back; confirmed directly in Postgres that `api_key_encrypted`/`secret_key_encrypted` are genuine Fernet ciphertext (not plaintext) and decrypt back to the exact original keys. `db/repository.py` (generic query helpers) deferred — not needed yet, routers query models directly; will add if/when Phase 3+ needs shared query logic across routers/nodes/monitor. Fixed one bug along the way: `DATABASE_URL` uses the `postgresql://` scheme which defaults to psycopg2 (not installed, we use psycopg3) — normalized in `db/session.py`.

- [x] **Phase 2 — Frontend: Next.js scaffold + auth + broker-connect pages.** Scaffold `frontend/` (Next.js 16 App Router, TypeScript, no Tailwind — minimal hand-written CSS); CORS already on the FastAPI app for `http://localhost:3000`; `lib/api.ts` (fetch client that stores `access_token` in `localStorage` and attaches `Authorization: Bearer` on every call); `login`/`signup` pages calling `routers/auth.py`; `broker` page calling `routers/broker.py`; a shared `NavBar` client component showing signed-in state. *Status: DONE,* then substantially extended past the original scaffold:
  - **Visual identity redesign**: dark ink-navy trading-terminal palette (`--background`/`--surface`/`--color-buy`/`--color-sell`/`--color-pending`, each signal color functionally bound to one meaning app-wide, never decorative); a signature `RecommendationCard` component (ticker/decision/confidence-meter/pending-approval strip/Approve-Reject buttons) built now as the landing-page hero so it's ready to reuse with real data in Phase 5's approvals page; `NavBar` redesigned into a sticky terminal-chrome bar with an active-route indicator and a live-pulse session chip; login/signup/broker pages restyled to match.
  - **Signup expanded**: first/last name, optional phone number, and country (used both as a profile field and to derive the phone's dial code) — backend `User` model gained `first_name`/`last_name`/`phone_number`/`country` columns (migration `4b01412dd140`), `SignupRequest.password` uses `pydantic.SecretStr`, `phone_number` uses `pydantic_extra_types.phone_numbers.PhoneNumberValidator` (validated/normalized to E.164). Frontend country field is a custom searchable combobox (`app/components/CountrySelect.tsx`, full ARIA combobox pattern) built on `libphonenumber-js` + `Intl.DisplayNames` (245 real countries, not a hand-rolled partial list) instead of a native `<select>`; the phone input's dial code is a fixed, non-editable prefix fused to the field (not embedded in the editable value) since a calling code can't be reverse-mapped to one country (`+1` is both the US and Canada).
  - **Auth simplified to Bearer-only**: dropped the httpOnly-cookie path entirely (including `/auth/logout`, since a stateless Bearer token has nothing server-side to invalidate) after a Swagger UI `/docs` usability request — `HTTPBearer` gives one global "Authorize" padlock instead of a per-endpoint cookie parameter.
  - **Accessibility fix**: the global `:focus-visible` ring used to reuse `--color-pending` (amber) for ordinary input focus, which conflicted with amber's reserved pending-approval meaning — added a dedicated neutral `--focus-ring` token.
  - Verified the full signup → login → broker-status → connect sequence with the same headers/origin a browser sends (including a CORS preflight check confirming `authorization`/`content-type` are allowed from `localhost:3000`); all pages compile and render with no server/console/lint/type errors. Note: `create-next-app` scaffolded its own nested `.git` inside `frontend/` — harmless but inconsistent with the rest of the (currently unversioned) project; worth deciding on one repo strategy once you're ready to start committing.

- [x] **Phase 3 — Signal graph on per-user Alpaca credentials (CLI only).** `graph/{state,providers,llm,signal_graph}.py`, `graph/nodes/{quant,debate,pm}.py`, `AlpacaMarketDataProvider` in `integrations/alpaca_market_data.py`; `services/signal_service.py::run_signal_for_user` (loads the user's `BrokerConnection` from Postgres via `services/broker_service.py::build_provider_for_user`, decrypts it, builds the provider, runs the graph) called by `scripts/run_signal.py`. *Status: DONE.* Ran end-to-end against the real connected account (`hamzamajeed466@gmail.com`, AAPL): quant metrics computed correctly, bull/bear debated 3 full rounds (using the `get_market_snapshot` tool to pull live bid/ask), PM landed on HOLD at 0.60 confidence — since that's under the 0.7 threshold, this run naturally exercised both `route_after_pm` branches (loop while under-confident, then end once `MAX_ROUNDS` hit), no artificial threshold-lowering needed. Three bugs fixed along the way: (1) `llama-3.3-70b-versatile` (originally planned) is no longer offered on Groq's current lineup — swapped to `openai/gpt-oss-120b`, the documented fallback from the original research; (2) Windows' console defaults to `cp1252`, which can't encode characters an LLM might emit (em-dashes, non-breaking hyphens) — `scripts/run_signal.py` now reconfigures stdout to UTF-8; (3) `pm_node`'s structured output used the default `method="function_calling"`, which forces the model to call a synthetic schema tool -- `openai/gpt-oss-120b` sometimes ignores that and answers in prose instead, which Groq then hard-rejects (`400: Tool choice is required, but model did not call a tool`) rather than degrading gracefully. Switched to `method="json_mode"` plus an explicit JSON-schema instruction in the prompt, which this model complies with reliably — confirmed via two full runs producing valid HOLD and SELL verdicts. `graph/providers.py`'s `Broker` protocol is declared (per the documented DI-seam shape) but not implemented until Phase 5. CLI-only, as planned — no frontend slice, Phase 4 exposes this over HTTP first.

- [x] **Phase 4 — FastAPI recommendation endpoints + analyze page.** `app/schemas/recommendations.py` (`AnalyzeResponse`); `app/routers/recommendations.py` with `POST /analyze/{symbol}` behind `get_current_user`, calling `services/signal_service.py::run_signal_for_user` via `asyncio.to_thread` (the service itself is fully synchronous — wrapping the whole call in a thread, rather than sprinkling `asyncio.to_thread` into every node, was the pragmatic choice here); frontend `analyze` page (symbol input, decision badge, `ConfidenceMeter` reused from `RecommendationCard`, metrics grid, full bull/bear debate transcript rendered round-by-round with teal/rose left-borders) plus a "Broker" sibling link and this one added to `NavBar`. *Status: DONE.* Verified: unauthenticated request → 401; a fresh test user with no broker connection → clean 400 (`NoBrokerConnectionError`) rather than a raw exception; connected a real paper account and got a valid `HOLD` verdict at 0.58 confidence through the actual HTTP endpoint; fired `/analyze/AAPL` and `/health` concurrently and confirmed `/health` returned in 0.26s while `/analyze` was still running 40s later, proving the event loop wasn't blocked; CORS preflight confirmed for the new route. Extracted `ConfidenceMeter` out of `RecommendationCard` into its own component during this phase since it now has two real call sites (the landing-page hero card and this results view), not a speculative abstraction. Test user + its broker connection cleaned up from Postgres afterward.
  - **Post-Phase-4 bug fixes found in real usage**: (1) `NavBar`'s auth check only ran once on mount (`useEffect(..., [])`) — since it lives in the root layout and persists across client-side navigations, logging in on `/login` and then navigating elsewhere never re-triggered the check, so it kept showing "Signed out" forever after a real login. Fixed by re-running the check on every `pathname` change instead of mount-only. (2) The LLM was outputting markdown (`**bold**`) in bull/bear arguments and PM's `reasoning`, which rendered as literal asterisks since nothing on the frontend parsed markdown — initially fixed at the prompt level (plain prose, no markdown). **Superseded shortly after**: the actual preference was scannable bullet points/bold highlights over prose paragraphs, so the real fix was the other direction — added `react-markdown` (`app/components/Markdown.tsx`, a small wrapper with CSS for `strong`/`ul`/`li` matching the design tokens) and flipped the prompts back to explicitly request 3-5 short `-` bullets with bolded key numbers (`graph/nodes/debate.py`, `graph/nodes/pm.py`). Applied everywhere agent text renders in `analyze/page.tsx` (bull/bear blocks, PM rationale) — note the wrapping element around PM's rationale had to change from `<p>` to `<div>` since `Markdown` renders block content (a `<div>`/`<ul>`) and a `<p>` can't legally contain block children. Verified via two CLI runs (NVDA) that the model reliably produces valid `- **bold**` list syntax for all three agents. (3) Hitting a real Groq rate limit (429, both TPM and TPD variants surfaced during testing) showed the raw provider error body directly in the UI — org ID, billing-upgrade link, JSON braces and all. The `except Exception` in `analyze_stream`'s generator wasn't actually *handling* the error, just preventing a crash while passing the raw message straight through. Added `app/errors.py::friendly_error_message` (`isinstance` against `groq.RateLimitError`/`groq.APIError`, generic fallback otherwise) — the real exception is still logged server-side via `logger.exception`, but the client only ever sees a clean, generic message. Applied to both the streaming endpoint's catch-all and the non-streaming `/analyze/{symbol}` endpoint, which previously had no handling at all beyond `NoBrokerConnectionError` (any Groq/Alpaca failure there would have surfaced as FastAPI's generic unhandled-500, now a proper 502 with a friendly `detail`). Also fixed a broker-page UX gap the same session: connecting a new key when a connection already existed gave no visible feedback (chip text stayed identical, only the form fields silently cleared) — added an explicit "✓ Connected" confirmation message.
  - **Streaming analyze results (post-Phase-4 enhancement)**: the original `/analyze/{symbol}` endpoint only returned once the entire graph finished (30-90s of silence). Added `POST /analyze/{symbol}/stream`, backed by `services/signal_service.py::stream_signal` (`graph.stream(..., stream_mode="updates")` instead of `.invoke()`) and returned as a newline-delimited-JSON `StreamingResponse` — one line per completed node. Deliberately NDJSON over SSE (no reconnect/event-id machinery needed for a one-shot response) and NDJSON over a WebSocket (one-directional, no need for the bidirectional channel Phase 6 will actually need for HITL approve/reject) — this is a narrower, simpler mechanism than Phase 11's planned live-market-data WebSocket, not a duplicate of it. The frontend (`lib/api.ts::analyzeSymbolStream`, using `fetch` + a manual `ReadableStream` reader rather than `EventSource`, since `EventSource` can't send an `Authorization` header) parses each line and updates the `analyze` page incrementally — metrics appear as soon as `quant` finishes, each round's BULL/BEAR blocks appear as soon as produced (with a "waiting for the bear analyst..." placeholder mid-round), and the verdict shown after each `pm` event is marked PROVISIONAL until the stream actually ends (since low-confidence rounds loop and get overwritten). One design note: the broker-connection lookup happens eagerly *before* `StreamingResponse` is constructed, specifically so a missing connection can still return a normal `400` — once streaming starts, the status code is locked at 200 and errors can only surface as a JSON line inside the stream. Verified with a live timestamped run (GOOGL): 10 update lines arrived spread across ~35 seconds (quant at t+0, final pm at t+35) rather than all at once.
  - **Ticker-collision discovery**: analyzing "BTC" returned a real-looking HOLD verdict at $32.15 — not a bug, but not spot Bitcoin either. Confirmed via Alpaca's Assets API that "BTC" on the *equities* API (the only one this system talks to) resolves to a real, distinct instrument: the **Grayscale Bitcoin Mini Trust ETF** (`class: us_equity`, exchange ARCA) — a trust share representing a fraction of held Bitcoin, not the coin's spot price. At the time of this finding the system did not support crypto (`BTC/USD` pair support was added later); the danger is that a ticker collision like this fails *silently* with plausible-looking numbers instead of erroring. General fix (not a crypto-specific patch): `MarketDataProvider.get_asset_name(symbol)` (new method, backed by `TradingClient.get_asset()`) resolves the real instrument name, which `quant_node` now includes in state and the `analyze` page displays right under the ticker with an explicit "double-check this is the instrument you meant" note — this surfaces *any* ticker-name mismatch, not just crypto-shaped ones. Verified end-to-end: CLI shows `=== BTC (Grayscale Bitcoin Mini Trust ETF) ===`; the streamed `quant` line carries `asset_name` too.

- [x] **Phase 5 — Human-in-the-loop + persistence + real paper orders + approvals page.** `nodes/{risk,human_approval,execution}.py`; switch to an async checkpointer; `POST /recommendations`, `/{thread_id}/approve`, `/reject`, `GET ?status=pending_approval` (all scoped to the authenticated user); frontend approvals page (list pending recommendations, approve/reject buttons wired to these endpoints) — this is the actual human-in-the-loop surface, not a bare test page. *Verify:* start a recommendation, confirm `pending_approval`; approve via the approvals page → a real bracket order appears on **your own** Alpaca paper account; reject a second → no order. Restart the backend process between start and approve on a third symbol to prove checkpointer persistence survives a restart. *Status: DONE (2026-11-13).* Verified through the real frontend + backend against the paper account: (1) AAPL run landed in `pending_approval` with qty/entry/stop/take-profit; (2) approving it submitted a real bracket order — confirmed on the Alpaca dashboard as a filled market buy of 61 @ ~$360.13 plus a $351.68 stop and $375.88 take-profit sell legs; (3) a rejected NVDA SELL placed no order (nothing on the Alpaca order list); a MSFT HOLD correctly ended with nothing to approve; (4) checkpointer persistence: with an AMZN BUY left pending, the uvicorn worker process was replaced (PID 2516 -> 17600) and the approvals page still listed it with its full order details (read back from the Postgres checkpointer), and approving it after the restart submitted the order (ledger rows in `recommendations`/`approvals`/`orders`). Side effects left on the paper account from testing: AAPL (61), TSLA (26, approved separately by the user) and AMZN (59) bracket orders. Fixed along the way: the approvals page kept showing the previous run's "Order submitted" notice after starting a new recommendation.

- [ ] **Phase 6 — Forward-test logger, validation, position-aware SELL, daily batch.** *Why first:* forward-test data can't be backfilled, and bad PM output must never reach the approval step. Built and verified in four parts, in this order:

  - [x] **6a — Output validation.** *Status: DONE.* `graph/validation.py::validate_order_levels` (BUY needs stop < entry < take-profit, SELL the reverse; all prices/qty finite and positive; zero qty is rejected with a buying-power message) runs in `risk_node` before the ledger row is written, so a bad proposal never reaches approval or a bracket order; the error surfaces through `friendly_error_message`. `pm_node` retries once on malformed JSON or an out-of-range value (confidence is already bounded by the Pydantic schema), then fails the run. 18 unit tests in `backend/tests/` (pytest added as a dev dependency) cover bad levels, NaN, zero/negative qty, the ledger-not-written case, and the PM retry. **Dropped the planned crypto guard:** the code already supports crypto pairs like `BTC/USD` (`is_crypto_symbol`, fractional qty, market orders, no crypto shorting), so the PLAN's older "US equities only, no crypto" statements are stale and a guard would break working behavior. Crypto stays supported; revisit the stale wording in the Deliberate simplifications section later.

  - [x] **6b — Position-aware SELL.** *Status: DONE.* The graph now carries `held_qty` (looked up from the user's Alpaca account via `Broker.get_held_qty`, long positions only) into the PM. The PM prompt changes with the holding: if the user owns shares the allowed calls are BUY/HOLD/SELL (SELL = exit); if not, they are BUY/HOLD/**AVOID** (AVOID = bearish, don't buy it now) and SELL is forbidden. `pm.enforce_position_rules` is a deterministic backstop (unheld SELL becomes AVOID, held AVOID becomes SELL). HOLD and AVOID both end the run with nothing to approve (`status: "avoid"`, shown as "bearish, but you don't hold this, so there's nothing to sell"). An approved SELL is an exit: `risk_node` sizes it to exactly the held quantity with no stop/take-profit, `execution_node` submits a plain market sell and creates no new Position row, and it re-checks the holding at approval time (refuses if nothing is held, caps at the held qty), so a stale or legacy pending SELL can never open a short. Shorting is out of scope. For a stock the user doesn't own, BUY = bullish, HOLD = neutral/unclear (shown in the UI as **WAIT** via `decisionLabel`, since "hold" implies shares), AVOID = bearish; the prompt defines them by direction of view and the API returns `held_qty` so the UI can label correctly. 42 unit tests pass; frontend types/lint clean. Verified live: NVDA (not held) came back AVOID with nothing pending, and `get_held_qty` returns the real position (0.029 `BTC` ETF) and 0 for AAPL/NVDA. Not verified live: an approved exit order, and the held-lookup for a real crypto position (`BTC/USD` positions may be keyed differently). Also bundled: risk per trade is now 0.5% of account equity capped at $250 (replaces the flat $500).

  - [ ] **6c — Forward-test logger.** Log every recommendation (timestamp, price at recommendation, decision, confidence, horizon) whether or not the user acts. New Alembic migration for outcome storage (extra columns or a `recommendation_outcomes` table). A scheduled scoring job scores each at 1, 5 and 20 trading days: return vs. entry, and vs. buy-and-hold of the same symbol. Bearish calls count as correct when price falls, whether or not a trade results, and are kept separate from trade P&L. *Verify:* a recommendation made today is auto-scored after 1 trading day and visible via query or a simple page; a bearish call on an unheld stock is scored without any order existing.

  - [ ] **6d — Daily batch.** A scheduled job analyzes a fixed list of ~25 liquid stocks each day and logs the results through the 6c logger with no orders placed (no UI or approval flow needed). This builds the sample size (hundreds of scored calls within a month or two). Spread across different stocks, sectors and dates, since same-day calls on correlated stocks are not independent bets. *Verify:* the batch runs on schedule, logs ~25 recommendations per run, places no orders, and handles a Groq rate limit without losing the rest of the batch.

- [ ] **Phase 7 — Approval hardening + multi-tenant isolation tests.** (a) Expire pending approvals after a configurable time (e.g. 30 min) and re-check current price vs. the entry hint at approve time, refusing if it moved past a threshold. (b) Idempotency: one order per recommendation (unique constraint + check on approve) and a `client_order_id` passed to Alpaca, so a double-click or retry can't submit twice. (c) Automated tests proving user A cannot list, read, approve or reject user B's recommendations, `thread_id`s or broker status (pay particular attention to `thread_id` lookups in `routers/recommendations.py`). *Verify:* approving twice submits exactly one order; approving an expired recommendation is refused with a clear message; isolation tests pass and fail when a scoping check is deliberately broken.

- [ ] **Phase 8 — Backtesting module + benchmark (moved up from old Phase 8 ahead of live streaming).** `backtest/{replay_provider,simulated_broker,simulator,runner,metrics}.py`; `backtest_runs` table (already in Phase 1 migration); dashboard backtest results page. Must include: next-bar fills only (no same-bar fills), a simple slippage/commission assumption, a buy-and-hold benchmark for the same symbol and period in the results, and leakage control (also run on dates after the model's training cutoff and report both). *Verify:* a historical run makes zero live Alpaca calls (one upfront bars fetch only); results land in Postgres tagged `mode='backtest'`; spot-check one simulated trade's stop/take-profit outcome against raw bars; the lookahead check becomes a permanent unit test; results (with the benchmark line) render on the dashboard.

- [ ] **DECISION CHECKPOINT (not a build phase).** After Phases 6-8, compare forward-test and backtest results against buy-and-hold. **Write the pass criteria down before looking at results** so luck can't be mistaken for skill; the numbers below are placeholders to be fixed together before the test starts: (1) enough data: at least ~100 scored calls (the unit is recommendations, not accounts; one account is enough), spread across stocks, sectors and dates because same-day calls on correlated stocks are not independent; (2) beats the benchmark: average return of BUY calls exceeds buy-and-hold of the same stocks by a set margin (e.g. 0.5%) at the 5-day horizon, after costs; (3) hit rate above 50%; (4) calibration: 0.8-confidence calls do better than 0.6-confidence ones; (5) still holds on dates after the model's training cutoff. All met: proceed to Phase 9. Not met: rethink the approach before building anything below.

- [ ] **Phase 9 — Opportunity scanner ("top ideas").** Turns the product from "user types a symbol" into "here are today's best ideas." Scan a liquid universe (e.g. S&P 500) on a schedule using bulk Alpaca bar fetches; score every symbol with cheap quant metrics only (trend, momentum, volatility, volume, no LLM); keep the top 10-20; run the full bull/bear/PM debate only on that shortlist (a single debate takes 30-90s and Groq rate limits already bite, so debating the whole universe is not feasible); rank results into a daily "Top ideas" list with confidence, reasoning and entry/stop/target; each idea still goes through the normal approval gate; notify the user when the list is ready. Every idea is logged by the Phase 6 forward-test logger so the list's real track record is measured. Paper-only until scoring data justifies more. Frontend: `ideas/page.tsx`. Depends on the decision checkpoint (do not automate a recommendation engine that has not beaten the benchmark). *Verify:* a scheduled scan over the universe completes within a bounded time and cost, only the shortlist reaches the LLM, results appear ranked on the page, approving an idea follows the same path as a manual recommendation, and each idea appears in the forward-test log.

- [ ] **Phase 10 — "My performance" + personalization.** Read the user's own Alpaca history (orders, fills, closed positions, including trades made outside this app) via the account/positions/orders/activities APIs; show trade count, realized/unrealized P&L, win rate, average win vs. average loss, drawdown, holding time, favorite symbols/sectors, and approved-vs-rejected outcomes of platform suggestions (from the Phase 6 logger). Add a short onboarding risk profile (risk tolerance, time horizon). Use it to personalize: position sizing from account size and risk profile, filtering the Top ideas list (e.g. down-rank symbols they already hold heavily), plain-language feedback, and simple guardrails (losing-streak or concentration warnings). Show sample sizes next to every stat (few trades say little about skill); fall back to a default profile for new accounts. Privacy: store only what is needed, say plainly what is kept, allow deletion. Note: tailoring suggestions to someone's finances moves closer to personalized investment advice, which strengthens the case for legal review before any launch. Frontend: `performance/page.tsx`. *Verify:* stats on the page match the numbers on the Alpaca dashboard for the same account; a new account with no history shows the default profile without errors; sizing changes when the risk profile changes.

- [ ] **Phase 11 — Live streaming + WebSocket + live view page (old Phase 6).** `routers/ws.py`; per-connection `StockDataStream` (or a shared stream multiplexed by watched symbols); trigger policy (bar-close/price-move → new recommendation run); frontend live view page (WS hook rendering node-progress/bar-tick/`awaiting_approval` messages). *Verify:* connect via the live view page during market hours, see live bar ticks and node-progress messages ending in `awaiting_approval` rendered in the browser (`static/client.html`/websocat still available as a backend-only fallback check).

- [ ] **Phase 12 — Trade lifecycle management (old Phase 7).** **Added from the 6b review:** the PM currently sees only the symbol, daily-bar indicators, the live quote and the held quantity; it does not know the position's entry price or unrealized P&L, so it cannot react to a position being in loss. The lifecycle monitor should pass entry price, current P&L and holding time into an exit-review prompt (routed through the normal approval path), and crypto positions need their stops enforced by the monitor since Alpaca crypto has no bracket orders. `positions`/`position_events` tables (already in the Phase 1 migration, now actually written to); `lifecycle/monitor.py` (fill listener + timeline checker + periodic re-review routing exits through the normal approval path); dashboard positions page. *Verify:* a tight-stop bracket order fills, the listener closes the position with correct `exit_reason`/pnl and a live WS notification the dashboard shows; a short test timeline triggers the reminder.

- [ ] **Phase 13 — Bounded autonomous bots (the real differentiator).** Analysis alone is easy to copy with any general chatbot; what a chatbot can't easily do is run unattended against the user's own broker account, within limits, with a record. Autonomy levels: (1) notify only = Phase 9 scanner; (2) approve each trade = current flow; (3) **pre-approved rules** = the user sets a budget, max trade size, allowed symbols, daily loss limit and an expiry date, and the bot trades inside those limits without asking each time; (4) full autopilot = NOT planned, and never beyond paper. Phase 13 targets level 3, paper-only until the forward-test track record justifies more. **Hard prerequisites (pulled out of the deferred list; do not start Phase 13 without them):** kill switch + automatic halt on repeated errors; per-trade and per-day dollar caps and a daily loss limit that pauses the bot; order reconciliation against Alpaca (partial fills, rejected legs, orders cancelled outside the app); the Phase 12 lifecycle monitor watching open positions; an append-only audit log of every bot action and the reasoning behind it; and the decision checkpoint passed (agent beats buy-and-hold). Implementation sketch: a `bots` table (user_id, rules JSON, status, expires_at), a background scheduler running scan → debate → rule check → order within limits, every action logged and visible on a `bots/page.tsx` with a one-click pause/kill. Legal note: acting on a user's behalf under rules they set is closer to managing money than suggesting trades; get legal review before any live-money or outside-user use. *Verify:* a bot with a small paper budget places only trades inside its rules; hitting the daily loss limit pauses it; the kill switch cancels open orders and stops all activity; every action appears in the audit log; reconciliation flags a manually cancelled order.

- [ ] **Phase 14 (optional/stretch, deferred).** Items parked in `PLAN_REVISIONS.md`: live crypto via ccxt (Alpaca crypto pairs already work), security hardening for real users (refresh-token rotation, httpOnly cookies, KMS), operations (job queue, error tracking, CI/CD, eval harness), richer inputs + prompt-injection hardening, portfolio-level correlation/sector risk, product features (decision journal, notifications), user watchlists, dashboard styling polish.



## Postgres setup (run these yourself — needs your local `postgres` superuser password, which stays in your own terminal)

```sql
-- from an elevated terminal: "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres
CREATE DATABASE trading_agent;
CREATE USER trading_agent_app WITH PASSWORD 'choose-a-local-dev-password';
GRANT ALL PRIVILEGES ON DATABASE trading_agent TO trading_agent_app;
```

Then set `DATABASE_URL=postgresql+psycopg://trading_agent_app:choose-a-local-dev-password@localhost:5432/trading_agent` in `backend/.env`.

## Critical files

- `backend/graph/providers.py` — DI seam letting live and backtest share every node unchanged
- `backend/graph/nodes/human_approval.py` — must stay interrupt-only given resume-replay semantics
- `backend/db/models.py` — shared schema everything else writes to; source of truth for Alembic autogenerate
- `backend/app/auth/dependencies.py` — every user-scoped route depends on this
- `backend/integrations/crypto.py` — the only place broker secrets are encrypted/decrypted
- `backend/services/signal_service.py` — shared by the CLI script and every future HTTP endpoint that runs the graph for a user
- `backend/app/routers/recommendations.py` — where interrupt/resume meets HTTP



## Deliberate simplifications (state these in the README as choices)

Single-symbol analysis through Phase 8 (the Phase 9 scanner screens a universe with cheap metrics but debates only a shortlist); IEX (not full SIP) market data on the free Alpaca tier; row/bar-index-based backtest fills; no retry/backoff beyond basic error handling; JWT access tokens with no refresh-token rotation and no server-side revocation/logout (fine for a local/demo app, not a production session model); frontend stores the Bearer token client-side rather than an httpOnly cookie (simpler, but more XSS-exposed — a real deployment would want httpOnly cookies or short-lived tokens + refresh); Fernet app-key encryption for broker credentials rather than a real KMS; dashboard has no styling investment beyond usability, no charting library; **Crypto is supported only through Alpaca's paper-style crypto pairs** (`BTC/USD` notation: fractional qty, market orders, no bracket orders, no crypto shorting; routed via `is_crypto_symbol`). The ticker `BTC` without a slash is still the Grayscale equity ETF, not the coin, which is why `asset_name` is always shown next to the ticker. Live crypto on another exchange (ccxt) is not built.