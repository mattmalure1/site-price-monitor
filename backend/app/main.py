from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging import configure_logging
from app.db.database import engine
from app.db.database import Base
from app.api.routes import opportunities, purchases, listings, blacklist

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="Card Arbitrage Intelligence Tool",
    description="Find underpriced graded Pokémon cards on eBay with disciplined max-bid math.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(opportunities.router, prefix="/api")
app.include_router(purchases.router, prefix="/api")
app.include_router(listings.router, prefix="/api")
app.include_router(blacklist.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
