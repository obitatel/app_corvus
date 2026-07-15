import sqlite3
import logging
import random
import aiosqlite
from dotenv import load_dotenv


DB_PATH = load_dotenv("DB_PATH")

# --- Синхронные функции для заполнения справочников (можно использовать отдельно) ---

def add_gtin(gtin):
    if isinstance(gtin, bytes):
        gtin = gtin.decode('utf-8', errors='ignore')
    else:
        gtin = str(gtin)
    with sqlite3.connect(DB_PATH, timeout=10) as db:
        db.text_factory = str
        db.execute('INSERT OR IGNORE INTO GTINS (GTIN) VALUES (?)', (gtin,))
        db.commit()

def add_qr(qr):
    qr = str(qr)
    with sqlite3.connect(DB_PATH, timeout=10) as db:
        db.text_factory = str
        db.execute('INSERT OR IGNORE INTO our_qr (qr) VALUES (?)', (qr,))
        db.commit()

def add_dm(dm):
    dm = str(dm)
    with sqlite3.connect(DB_PATH, timeout=10) as db:
        db.text_factory = str
        db.execute('INSERT OR IGNORE INTO our_dm (dm) VALUES (?)', (dm,))
        db.commit()

# --- Асинхронные функции для проверок и вставки в tickets ---

async def qr_exists(qr: str) -> bool:
    """Проверяет, есть ли QR в таблице our_qr."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute('SELECT 1 FROM our_qr WHERE qr = ?', (qr,))
        return await cursor.fetchone() is not None

async def dm_exists(dm: str) -> bool:
    """Проверяет, есть ли DM в таблице our_dm."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute('SELECT 1 FROM our_dm WHERE dm = ?', (dm,))
        return await cursor.fetchone() is not None

async def is_qr_used(qr: str) -> bool:
    """Проверяет, использован ли QR в таблице tickets."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute('SELECT 1 FROM tickets WHERE QR = ?', (qr,))
        return await cursor.fetchone() is not None

async def is_dm_used(dm: str) -> bool:
    """Проверяет, использован ли DM в таблице tickets."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute('SELECT 1 FROM tickets WHERE DM = ?', (dm,))
        return await cursor.fetchone() is not None

async def generate_unique_ticket_id() -> str:
    """Генерирует 7-значный числовой ticket_id, гарантируя уникальность."""
    while True:
        ticket_id = str(random.randint(1000000, 9999999))
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute('SELECT 1 FROM tickets WHERE ticket_id = ?', (ticket_id,))
            if await cursor.fetchone() is None:
                return ticket_id

async def insert_ticket(user_id: int, qr: str, dm: str, ticket_id: str) -> int:
    """Вставляет новую заявку и возвращает ID записи."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            'INSERT INTO tickets (user_id, QR, DM, ticket_id) VALUES (?, ?, ?, ?)',
            (user_id, qr, dm, ticket_id)
        )
        await db.commit()
        return cursor.lastrowid