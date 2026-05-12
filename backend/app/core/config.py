from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/card_arbitrage"
    redis_url: str = "redis://localhost:6379/0"

    # eBay
    ebay_app_id: str = ""
    ebay_cert_id: str = ""
    ebay_dev_id: str = ""
    ebay_user_token: str = ""
    ebay_environment: str = "production"

    # PriceCharting
    pricecharting_api_key: str = ""

    # Alerts
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    alert_phone_number: str = ""

    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    alert_email: str = ""

    discord_webhook_url: str = ""
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # App
    secret_key: str = "change-me-in-production"
    cors_origins: str = "http://localhost:3000"
    log_level: str = "INFO"

    # Bankroll limits
    monthly_budget: float = 2000.00
    daily_max_spend: float = 250.00
    max_single_card: float = 150.00
    max_per_pokemon: float = 300.00
    max_per_set: float = 500.00
    max_open_auctions: int = 25
    min_expected_profit: float = 15.00
    min_roi_percent: float = 25.0

    # Scoring thresholds
    urgent_alert_score: int = 85
    review_score: int = 70

    # eBay fees
    ebay_final_value_fee_rate: float = 0.1325
    ebay_per_order_fee: float = 0.40

    # Shipping/supplies defaults
    default_shipping_out: float = 6.00
    default_supplies: float = 0.50

    # Confidence
    min_match_confidence: float = 0.80

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
