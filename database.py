import logging
import uuid
import json
from typing import List, Dict, Any, Optional
import aiosqlite

DB_PATH = "scanner_data.db"


async def init_db():
    """Создаёт все таблицы, если их нет."""
    async with aiosqlite.connect(DB_PATH) as db:
        # Таблица справочников
        await db.execute('''
            CREATE TABLE IF NOT EXISTS our_qr (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                qr TEXT UNIQUE NOT NULL
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS our_dm (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dm TEXT UNIQUE NOT NULL
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS GTINS (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                GTIN TEXT UNIQUE NOT NULL
            )
        ''')
        # Основная таблица заявок
        await db.execute('''
            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                QR TEXT NOT NULL,
                DM TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ticket_id TEXT NOT NULL,
                UNIQUE(QR),
                UNIQUE(DM),
                UNIQUE(ticket_id)
            )
        ''')
        # Индексы для ускорения поиска
        await db.execute('CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets (user_id)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets (created_at)')
        await db.commit()
        logging.info("База данных инициализирована")


async def save_ticket(user_id: int, qr_text: str, dm_text: str) -> int:
    """
    Сохраняет новую заявку (ticket).
    Генерирует уникальный ticket_id.
    Возвращает ID созданной записи.
    Выбрасывает исключение при нарушении уникальности (дубликат QR или DM).
    """
    # Генерация уникального ticket_id (можно использовать UUID без дефисов)
    ticket_id = uuid.uuid4().hex

    async with aiosqlite.connect(DB_PATH) as db:
        try:
            cursor = await db.execute('''
                INSERT INTO tickets (user_id, QR, DM, ticket_id)
                VALUES (?, ?, ?, ?)
            ''', (user_id, qr_text, dm_text, ticket_id))
            await db.commit()
            return cursor.lastrowid
        except aiosqlite.IntegrityError as e:
            # Обрабатываем нарушение уникальности
            if "UNIQUE constraint failed: tickets.QR" in str(e):
                raise ValueError("QR-код уже зарегистрирован в системе.")
            elif "UNIQUE constraint failed: tickets.DM" in str(e):
                raise ValueError("DataMatrix уже зарегистрирован в системе.")
            elif "UNIQUE constraint failed: tickets.ticket_id" in str(e):
                # маловероятно, но на всякий случай
                raise ValueError("Ошибка генерации уникального идентификатора.")
            else:
                raise e


async def get_ticket_by_qr(qr: str) -> Optional[Dict[str, Any]]:
    """Поиск заявки по QR-коду."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute('SELECT * FROM tickets WHERE QR = ?', (qr,))
        row = await cursor.fetchone()
        return dict(row) if row else None


async def get_ticket_by_dm(dm: str) -> Optional[Dict[str, Any]]:
    """Поиск заявки по DataMatrix."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute('SELECT * FROM tickets WHERE DM = ?', (dm,))
        row = await cursor.fetchone()
        return dict(row) if row else None


async def get_tickets_by_user(user_id: int, limit: int = 50) -> List[Dict[str, Any]]:
    """Возвращает последние заявки пользователя."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute('''
            SELECT * FROM tickets
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        ''', (user_id, limit))
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


# Функции для справочников (если понадобятся)
async def add_qr_to_dict(qr: str) -> int:
    """Добавляет QR в справочник our_qr, если его там нет."""
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            cursor = await db.execute('INSERT OR IGNORE INTO our_qr (qr) VALUES (?)', (qr,))
            await db.commit()
            return cursor.lastrowid
        except Exception as e:
            logging.error(f"Ошибка добавления QR в справочник: {e}")
            raise


async def add_dm_to_dict(dm: str) -> int:
    """Добавляет DM в справочник our_dm."""
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            cursor = await db.execute('INSERT OR IGNORE INTO our_dm (dm) VALUES (?)', (dm,))
            await db.commit()
            return cursor.lastrowid
        except Exception as e:
            logging.error(f"Ошибка добавления DM в справочник: {e}")
            raise


async def add_gtin_to_dict(gtin: str) -> int:
    """Добавляет GTIN в справочник GTINS."""
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            cursor = await db.execute('INSERT OR IGNORE INTO GTINS (GTIN) VALUES (?)', (gtin,))
            await db.commit()
            return cursor.lastrowid
        except Exception as e:
            logging.error(f"Ошибка добавления GTIN в справочник: {e}")
            raise