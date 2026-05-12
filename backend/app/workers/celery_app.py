from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "card_arbitrage",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.workers.ebay_scanner",
        "app.workers.pc_sync",
        "app.workers.opportunity_scorer",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        # Scan auctions ending in the next 60 minutes — every 3 minutes
        "scan-ebay-auctions": {
            "task": "app.workers.ebay_scanner.scan_auctions",
            "schedule": 180.0,
        },
        # Scan Buy It Now listings — every 5 minutes
        "scan-ebay-bin": {
            "task": "app.workers.ebay_scanner.scan_bin",
            "schedule": 300.0,
        },
        # Sync PriceCharting prices — daily at 3am UTC
        "sync-pricecharting": {
            "task": "app.workers.pc_sync.sync_all_prices",
            "schedule": 86400.0,
        },
        # Re-score open opportunities — every 2 minutes
        "rescore-opportunities": {
            "task": "app.workers.opportunity_scorer.rescore_pending",
            "schedule": 120.0,
        },
    },
)
