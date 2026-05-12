"""
Alert service: sends notifications via Discord, Telegram, SMS, and email.
"""
import httpx
import asyncio
from app.core.config import settings
from app.core.logging import logger


async def send_opportunity_alert(
    card_name: str,
    grader: str,
    grade: float,
    market_value: float,
    current_total: float,
    max_bid: float,
    expected_profit: float,
    roi: float,
    score: float,
    listing_url: str,
    minutes_left: int | None = None,
) -> None:
    time_str = f"Ends in {minutes_left}m" if minutes_left else "BIN"
    message = (
        f"CARD ARBITRAGE ALERT\n"
        f"Card: {grader} {grade} {card_name}\n"
        f"Market: ${market_value:.2f}\n"
        f"Current: ${current_total:.2f}\n"
        f"Max bid: ${max_bid:.2f}\n"
        f"Profit: ${expected_profit:.2f} ({roi:.0f}% ROI)\n"
        f"Score: {score:.0f}/100\n"
        f"{time_str}\n"
        f"{listing_url}"
    )

    tasks = []
    if settings.discord_webhook_url:
        tasks.append(_send_discord(message))
    if settings.telegram_bot_token and settings.telegram_chat_id:
        tasks.append(_send_telegram(message))
    if settings.twilio_account_sid and settings.alert_phone_number:
        tasks.append(_send_sms(message))

    if tasks:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, Exception):
                logger.warning("alert_send_failed", error=str(r))


async def _send_discord(message: str) -> None:
    async with httpx.AsyncClient() as client:
        await client.post(
            settings.discord_webhook_url,
            json={"content": f"```\n{message}\n```"},
            timeout=10,
        )


async def _send_telegram(message: str) -> None:
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    async with httpx.AsyncClient() as client:
        await client.post(
            url,
            json={"chat_id": settings.telegram_chat_id, "text": message},
            timeout=10,
        )


async def _send_sms(message: str) -> None:
    from twilio.rest import Client
    client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    # Twilio client is sync; run in thread to avoid blocking event loop
    await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: client.messages.create(
            body=message[:1600],
            from_=settings.twilio_from_number,
            to=settings.alert_phone_number,
        ),
    )
