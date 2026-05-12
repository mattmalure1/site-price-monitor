# Card Arbitrage Intelligence Tool

Find underpriced graded Pokémon cards on eBay, calculate your safe max buy price, rank the best opportunities, and alert you before they close.

## What it does

- Scans eBay every 3 minutes for PSA 10, PSA 9, CGC 10, BGS 9.5/10 Pokémon auctions
- Scans Buy It Now listings every 5 minutes
- Parses titles to extract card name, set, grade, grader, language, and variant
- Matches listings against a local PriceCharting price cache (updated daily)
- Runs the full max-bid math: market value → resale value → fees → shipping → supplies → risk buffer → target profit → **max bid**
- Scores each opportunity 0–100 across profit, ROI, confidence, liquidity, seller quality, and timing
- Sends GREEN alerts (score ≥ 85) via Discord / Telegram / SMS
- Dashboard shows best live opportunities with one-click "Review" detail view

## Phase 1: MVP (current)

Manual bidding — you approve every purchase.

The tool tells you:
- Exact max bid
- Expected net profit
- ROI
- Confidence score
- Risk flags
- Link to the eBay listing

You place the bid. You track the result.

## Stack

| Layer | Tech |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy (async), PostgreSQL |
| Workers | Celery + Redis (scanner, PC sync, scorer, alerts) |
| Frontend | Next.js 14, Tailwind CSS, SWR |
| Alerts | Discord, Telegram, SMS (Twilio) |

## Quick Start

```bash
# 1. Clone and run setup
bash scripts/setup.sh

# 2. Fill in API keys
vim backend/.env

# 3. Start infrastructure
docker-compose up -d postgres redis

# 4. Run migrations
cd backend
source .venv/bin/activate
alembic upgrade head

# 5. Start backend
uvicorn app.main:app --reload

# 6. Start Celery worker + beat scheduler
celery -A app.workers.celery_app worker --beat -l info

# 7. Start frontend (new terminal)
cd frontend
npm run dev
# Open http://localhost:3000
```

## Configuration (`backend/.env`)

| Key | Description |
|---|---|
| `EBAY_APP_ID` | eBay Developer App ID (Browse API) |
| `EBAY_CERT_ID` | eBay Cert ID |
| `PRICECHARTING_API_KEY` | PriceCharting API key |
| `DISCORD_WEBHOOK_URL` | Discord channel webhook for alerts |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |
| `MONTHLY_BUDGET` | Monthly spend cap (default $2,000) |
| `DAILY_MAX_SPEND` | Daily spend cap (default $250) |
| `MIN_EXPECTED_PROFIT` | Minimum profit to alert (default $15) |
| `MIN_ROI_PERCENT` | Minimum ROI to alert (default 25%) |

## Bankroll Rules (enforced)

- Monthly budget: $2,000
- Daily max spend: $250
- Max single card: $150
- Max open auctions: 25
- Min expected profit: $15
- Min ROI: 25%

All configurable in `.env`.

## Score → Action

| Score | Signal | Action |
|---|---|---|
| 85–100 | GREEN | Urgent alert + dashboard |
| 70–84 | YELLOW | Dashboard review |
| 50–69 | RED | Ignore |
| < 50 | PASS | Filtered out |

## Max-Bid Formula

```
resale_value = market_value × liquidity_adj × confidence_adj

max_bid = resale_value
        − eBay fees (13.25% + $0.40)
        − outbound shipping
        − supplies ($0.50)
        − risk buffer (7–20%)
        − target profit (max($15, 20% of resale))
        − inbound shipping
```

## Roadmap

- [ ] Phase 2: Manual approval bid queue (one-click "Bid up to $X")
- [ ] Phase 3: eBay Offer API bid automation (requires eBay partner approval)
- [ ] Image OCR: slab label verification (PSA vs CGC, grade cross-check)
- [ ] Raw card support
- [ ] Sealed product support
- [ ] Video game category expansion (PriceCharting already covers this)
