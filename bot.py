import asyncio
import logging
import json
import os
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import WebAppInfo, KeyboardButton, ReplyKeyboardMarkup

# Импортируем функции из database.py
from database import (
    qr_exists, dm_exists, is_qr_used, is_dm_used,
    generate_unique_ticket_id, insert_ticket
)

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

@dp.message(lambda message: message.web_app_data is not None)
async def handle_web_app_data(message: types.Message):
    logging.info(f"Получены данные: {message.web_app_data.data}")
    try:
        payload = json.loads(message.web_app_data.data)
        codes = payload.get('codes', [])
        if not codes:
            await message.answer("❌ Нет кодов.")
            return

        # Извлекаем QR и DM
        qr = None
        dm = None
        for code in codes:
            fmt = code.get('format')
            txt = code.get('text')
            if fmt == 'QRCode':
                qr = txt
            elif fmt == 'DataMatrix':
                dm = txt

        if not qr or not dm:
            await message.answer("❌ Не найдены оба кода (QR и DataMatrix).")
            return

        # Проверка QR в справочнике
        if not await qr_exists(qr):
            await message.answer("❌ Невалидный QR-код.")
            return

        # Проверка DM в справочнике
        if not await dm_exists(dm):
            await message.answer("❌ Невалидный DataMatrix код.")
            return

        # Проверка, не использован ли QR
        if await is_qr_used(qr):
            await message.answer("❌ QR-код уже был использован.")
            return

        # Проверка, не использован ли DM
        if await is_dm_used(dm):
            await message.answer("❌ DataMatrix код уже был использован.")
            return

        # Генерация уникального ticket_id
        ticket_id = await generate_unique_ticket_id()

        # Вставка в tickets
        user_id = message.from_user.id
        record_id = await insert_ticket(user_id, qr, dm, ticket_id)

        # Успешный ответ
        await message.answer(f"✅ Заявка успешно создана!\nНомер билета: {ticket_id}")

    except Exception as e:
        logging.exception("Ошибка обработки")
        await message.answer("❌ Внутренняя ошибка. Попробуйте позже.")

# Универсальный обработчик для отладки
@dp.message()
async def catch_all(message: types.Message):
    logging.info(f"Получено сообщение от {message.from_user.id}: {message.text}")

async def main():
    logging.info("Бот запущен")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())