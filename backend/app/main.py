from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.deps import lifespan
from app.routers import auth, broker, recommendations

app = FastAPI(title="AI Trading Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(broker.router)
app.include_router(recommendations.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
