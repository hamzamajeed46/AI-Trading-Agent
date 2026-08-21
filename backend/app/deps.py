from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.config import settings
from graph.signal_graph import build_signal_graph


# Windows note: psycopg's async mode can't run on ProactorEventLoop, only
# a selector-based loop. uvicorn on Windows defaults to ProactorEventLoop
# UNLESS running with --reload or workers>1, in which case it already
# switches to SelectorEventLoop for its own subprocess-supervisor reasons --
# which happens to be exactly what this pool needs too. Run this app with
# `--reload` (as documented in README.md) or it will hang on startup here.


def _libpq_conninfo(url: str) -> str:
    # psycopg's connection pool wants a plain libpq conninfo string -- unlike
    # SQLAlchemy, it doesn't understand the "+psycopg" dialect suffix.
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = AsyncConnectionPool(
        conninfo=_libpq_conninfo(settings.database_url),
        max_size=10,
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
        open=False,
    )
    await pool.open()

    checkpointer = AsyncPostgresSaver(pool)
    await checkpointer.setup()  # idempotent -- creates/migrates the checkpointer's own tables

    app.state.checkpointer_pool = pool
    app.state.signal_graph = build_signal_graph(checkpointer=checkpointer)

    yield

    await pool.close()


def get_signal_graph(request: Request):
    return request.app.state.signal_graph
