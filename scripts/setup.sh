#!/usr/bin/env bash
set -e

echo "==> Setting up Card Arbitrage Tool"

# Backend
echo "-> Installing Python dependencies..."
cd backend
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Copy env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "   Created backend/.env — fill in your API keys!"
fi

cd ..

# Frontend
echo "-> Installing Node dependencies..."
cd frontend
npm install

if [ ! -f .env.local ]; then
  cp .env.local.example .env.local
  echo "   Created frontend/.env.local"
fi

cd ..

echo ""
echo "Done! Next steps:"
echo "  1. Edit backend/.env with your eBay and PriceCharting API keys"
echo "  2. Start services: docker-compose up -d postgres redis"
echo "  3. Run migrations: cd backend && alembic upgrade head"
echo "  4. Start backend: uvicorn app.main:app --reload"
echo "  5. Start workers: celery -A app.workers.celery_app worker --beat -l info"
echo "  6. Start frontend: cd frontend && npm run dev"
