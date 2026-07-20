import asyncio
import logging
import json
import os
from logging.handlers import RotatingFileHandler
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import WebAppInfo, KeyboardButton, ReplyKeyboardMarkup

from database import (
    qr_exists, dm_exists, is_qr_used, is_dm_used,
    generate_unique_ticket_id, insert_ticket,
    get_tickets_by_user  # новая функция
)

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
WEB_APP_URL = os.getenv("WEB_APP_URL")

if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN не задан")
if not WEB_APP_URL:
    raise ValueError("WEB_APP_URL не задан")

# --- Настройка логирования ---
LOG_FILE = "bot.log"
logger = logging.getLogger("scanner_bot")
logger.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=5, encoding='utf-8')
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)
console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

logging.basicConfig(level=logging.INFO)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


# --- Клавиатура с двумя кнопками ---
def get_main_keyboard():
    scanner_btn = KeyboardButton(
        text="📷 Открыть сканер",
        web_app=WebAppInfo(url=WEB_APP_URL)
    )
    lottery_btn = KeyboardButton(
        text="Лотерея Doyousam"
    )
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[scanner_btn, lottery_btn]],
        resize_keyboard=True
    )
    return keyboard


@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    await message.answer(
        "Добро пожаловать! Выберите действие:",
        reply_markup=get_main_keyboard()
    )
    logger.info(f"Пользователь {message.from_user.id} запустил /start")


# --- Обработчик кнопки "Лотерея Doyousam" ---
@dp.message(lambda message: message.text == "Лотерея Doyousam")
async def show_my_tickets(message: types.Message):
    user_id = message.from_user.id
    tickets = await get_tickets_by_user(user_id)
    if not tickets:
        await message.answer(
            "У вас пока нет билетов. Отсканируйте QR и DataMatrix, чтобы получить билет.",
            reply_markup=get_main_keyboard()
        )
        return

    # Формируем список с порядковыми номерами
    lines = []
    for idx, ticket in enumerate(tickets, start=1):
        ticket_id = ticket['ticket_id']
        created = ticket['created_at']
        lines.append(f"{idx}. {ticket_id} (от {created})")

    text = "Ваши билеты:\n" + "\n".join(lines)
    await message.answer(text, reply_markup=get_main_keyboard())
    logger.info(f"Пользователь {user_id} запросил список билетов, найдено {len(tickets)}")


# --- Обработчик данных из веб-приложения (без изменений) ---
@dp.message(lambda message: message.web_app_data is not None)
async def handle_web_app_data(message: types.Message):
    user = message.from_user
    user_info = f"user_id={user.id}, username={user.username}, first_name={user.first_name}, last_name={user.last_name}"
    logger.info(f"Получены данные от {user_info}: {message.web_app_data.data}")

    try:
        payload = json.loads(message.web_app_data.data)
        codes = payload.get('codes', [])
        if not codes:
            logger.warning(f"Нет кодов в данных от {user.id}")
            await message.answer("❌ Нет кодов.", reply_markup=get_main_keyboard())
            return

        qr = None
        dm = None
        for code in codes:
            fmt = code.get('format')
            txt = code.get('text')
            if fmt == 'QRCode':
                qr = txt
            elif fmt == 'DataMatrix':
                dm = txt

        logger.info(f"Распознаны QR={qr}, DM={dm} от {user.id}")

        if not qr or not dm:
            logger.warning(f"Не найдены оба кода от {user.id}: QR={qr}, DM={dm}")
            await message.answer("❌ Не найдены оба кода (QR и DataMatrix).", reply_markup=get_main_keyboard())
            return

        # Проверка QR
        if not await qr_exists(qr):
            logger.warning(f"QR={qr} не найден в справочнике, пользователь {user.id}")
            await message.answer("❌ Невалидный QR-код.", reply_markup=get_main_keyboard())
            return

        # Проверка DM
        if not await dm_exists(dm):
            logger.warning(f"DM={dm} не найден в справочнике, пользователь {user.id}")
            await message.answer("❌ Невалидный DataMatrix код.", reply_markup=get_main_keyboard())
            return

        # Проверка, не использован ли QR
        if await is_qr_used(qr):
            logger.warning(f"QR={qr} уже использован, пользователь {user.id}")
            await message.answer("❌ QR-код уже был использован.", reply_markup=get_main_keyboard())
            return

        # Проверка, не использован ли DM
        if await is_dm_used(dm):
            logger.warning(f"DM={dm} уже использован, пользователь {user.id}")
            await message.answer("❌ DataMatrix код уже был использован.", reply_markup=get_main_keyboard())
            return

        # Генерация ticket_id
        ticket_id = await generate_unique_ticket_id()
        logger.info(f"Сгенерирован ticket_id={ticket_id} для {user.id}")

        # Вставка в tickets
        record_id = await insert_ticket(user.id, qr, dm, ticket_id)
        logger.info(f"Запись создана с id={record_id}, ticket_id={ticket_id}, пользователь {user.id}")

        await message.answer(
            f"✅ Заявка успешно создана!\nНомер билета: {ticket_id}",
            reply_markup=get_main_keyboard()
        )

    except Exception as e:
        logger.exception(f"Ошибка обработки данных от {user.id}: {e}")
        await message.answer("❌ Внутренняя ошибка. Попробуйте позже.", reply_markup=get_main_keyboard())


# Универсальный обработчик для отладки
@dp.message()
async def catch_all(message: types.Message):
    logger.info(f"Получено сообщение от {message.from_user.id}: {message.text}")


async def main():
    logger.info("Бот запущен")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())