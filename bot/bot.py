import asyncio
import logging
import json
import os
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import WebAppInfo, KeyboardButton, ReplyKeyboardMarkup

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
WEB_APP_URL = os.getenv("WEB_APP_URL")

if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN не задан")
if not WEB_APP_URL:
    raise ValueError("WEB_APP_URL не задан")

logging.basicConfig(level=logging.INFO)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    web_app_button = KeyboardButton(
        text="📷 Открыть сканер",
        web_app=WebAppInfo(url=WEB_APP_URL)
    )
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[web_app_button]],
        resize_keyboard=True
    )
    await message.answer("Нажмите кнопку, чтобы открыть сканер.", reply_markup=keyboard)

# Обработчик для web_app_data
@dp.message(lambda message: message.web_app_data is not None)
async def handle_web_app_data(message: types.Message):
    logging.info(f"Получены данные: {message.web_app_data.data}")
    try:
        data = json.loads(message.web_app_data.data)
        codes = data.get('codes', [])
        if not codes:
            await message.answer("❌ Нет кодов.")
            return
        reply = "✅ Получены коды:\n" + "\n".join([f"- {c['format']}: {c['text']}" for c in codes])
        await message.answer(reply)
    except Exception as e:
        logging.exception("Ошибка обработки")
        await message.answer(f"❌ Ошибка: {e}")

# Универсальный обработчик (для отладки)
@dp.message()
async def catch_all(message: types.Message):
    logging.info(f"Получено сообщение от {message.from_user.id}: {message.text}")

async def main():
    logging.info("Бот запущен")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())