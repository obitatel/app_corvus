import asyncio
from aiogram import Bot
import os
from dotenv import load_dotenv

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")

async def delete_webhook():
    bot = Bot(token=BOT_TOKEN)
    await bot.delete_webhook(drop_pending_updates=True)
    print("✅ Вебхук удалён, пропущенные обновления сброшены")
    await bot.session.close()

asyncio.run(delete_webhook())