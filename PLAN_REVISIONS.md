# PLAN revisions (trimmed): proposed, not yet merged into PLAN.md

Status: DRAFT. Nothing here is built. PLAN.md is unchanged.
Working agreement still applies: one phase at a time, wait for an explicit go-ahead.

Goal of this revision: first find out whether the agent has any edge on equities, and harden the approval flow, before adding features.

---

## Do next (in this order)

### R1. Forward-test logger
- Log every recommendation with timestamp, price at recommendation, decision, confidence, and horizon, whether or not the user acts on it.
- Auto-score each at 1, 5, and 20 trading days (return vs. entry price, and vs. buy-and-hold of the same symbol).
- Cannot be backfilled, so build it first.
- Extends the existing `recommendations` table (new migration for outcome columns or a `recommendation_outcomes` table) plus a scheduled scoring job.
- *Verify:* a recommendation made today gets scored automatically after 1 trading day; results visible via a query or simple page.

### R2. Output validation
- Strict schema checks on PM output in `pm_node`/`risk_node`: for BUY, stop < entry < take-profit; for SELL, the reverse; qty > 0; confidence in [0, 1].
- Invalid output is rejected (retry once, then fail the run with a clear error), never passed to the approval step.
- *Verify:* unit tests with deliberately bad levels (stop above entry on a BUY, etc.) are rejected.

### R3. Stale-approval expiry + duplicate-order protection
- Expire pending approvals after a configurable time (e.g. 30 min); re-check current price against the entry hint at approve time and refuse if it moved more than a threshold.
- Idempotency: one order per recommendation (unique constraint plus a check on approve), so a double-click or retry cannot submit twice. Pass a `client_order_id` to Alpaca.
- *Verify:* approving twice submits one order; approving an expired recommendation is refused with a clear message.

### R4. Multi-tenant isolation tests
- Automated tests proving user A cannot list, read, approve, or reject user B's recommendations, `thread_id`s, or broker status.
- Pay particular attention to `thread_id` lookups in `routers/recommendations.py`.
- *Verify:* tests pass; a deliberately broken scoping check makes them fail.

### R5. Basic benchmark + backtest first (replaces the old order of Phases 6-8)
- Build the Phase 8 backtest **before** Phase 6 (live streaming).
- Include: next-bar fills only, simple slippage/commission assumption, and a buy-and-hold benchmark for the same symbol and period.
- Leakage control: also run on dates after the model's training cutoff and report both.
- Permanent test: the lookahead check from Phase 8 becomes a standing unit test.
- *Verify:* as in PLAN.md Phase 8, plus a benchmark line in the results.

Decision point after R1-R5: if the agent does not beat buy-and-hold on forward-test and backtest data, rethink the approach before building live streaming, lifecycle, or crypto.

---

## Deferred (do not build yet)

Revisit only after the decision point above, or before any outside user:

- **Crypto support** (Alpaca paper crypto, `asset_class`, 365-day annualization, crypto sizing, ccxt live broker). Reasons to wait: edge on equities is unproven, live crypto is probably unavailable on Alpaca from Pakistan, and it touches schema, risk sizing, and the lifecycle monitor. Cheap interim fix for the `BTC` collision: detect crypto-shaped symbols (e.g. `BTC/USD`, `ETH`) and return a clear "crypto not supported" error. Claims to verify first: Alpaca crypto bracket-order support and region availability.
- **Security hardening for real users:** KMS/per-user keys, refresh-token rotation, httpOnly cookies, login rate limiting, email verification, password reset, append-only audit log.
- **Operations:** job queue, Sentry/structured logging, CI/CD, eval harness for prompts.
- **Richer inputs and prompt-injection hardening** (news, filings, fundamentals, earnings dates). Prompt injection only matters once untrusted text enters prompts.
- **Portfolio-level risk, kill switch, order reconciliation, live-mode dollar caps** (relevant before live-money use).
- **Product features:** decision journal, explainability view, performance dashboard, notifications, watchlists.
- **Legal and business:** investment-advice question, supported countries, ToS/privacy, pricing from measured per-run cost. Only relevant if launching commercially.
- **Repo hygiene:** git log shows the frontend was consolidated in commit ed2b8ca; just confirm no nested `.git` remains in `frontend/`.
