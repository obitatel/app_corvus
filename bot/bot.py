import asyncio
import json
import logging
import os
from pathlib import Path
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup


BASE_DIR = Path(__file__).parent.parent
ENV_PATH = BASE_DIR / '.env'
load_dotenv(dotenv_path=ENV_PATH)

# Настройка логирования
logging.basicConfig(level=logging.INFO)

BOT_TOKEN = os.getenv("BOT_TOKEN")  # или укажите токен явно
WEB_APP_URL = os.getenv("WEB_APP_URL")  # реальный URL вашего мини-приложения

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# Команда /start – кнопка для открытия сканера
@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📷 Открыть сканер", web_app=WebAppInfo(url=WEB_APP_URL))]
    ])
    await message.answer(
        "Нажмите кнопку, чтобы открыть сканер Data Matrix / QR.",
        reply_markup=keyboard
    )

# Обработчик данных из веб-приложения
@dp.message(lambda message: message.web_app_data is not None)
async def handle_web_app_data(message: types.Message):
    web_app_data = message.web_app_data
    data_str = web_app_data.data
    logging.info(f"Получены данные: {data_str}")

    try:
        payload = json.loads(data_str)
        codes = payload.get("codes", [])

        if not codes:
            await message.answer("❌ Данные не содержат кодов.")
            return

        # Формируем красивый ответ
        lines = []
        for idx, code in enumerate(codes, start=1):
            text = code.get("text", "нет текста")
            fmt = code.get("format", "неизвестный формат")
            lines.append(f"{idx}. {fmt}: {text}")

        reply_text = "✅ Получены коды:\n" + "\n".join(lines)
        await message.answer(reply_text)

    except json.JSONDecodeError:
        await message.answer("❌ Ошибка: получены некорректные данные.")
    except Exception as e:
        logging.exception("Ошибка обработки данных")
        await message.answer("❌ Произошла внутренняя ошибка.")

# Запуск бота
async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())