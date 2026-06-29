from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.settings import load_settings


class Database:
    def __init__(self, db_path: str) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialized = False

    def initialize(self) -> None:
        if self._initialized:
            return
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    openid TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    last_login_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS ai_quota_accounts (
                    user_id INTEGER PRIMARY KEY,
                    purchased_quota_total INTEGER NOT NULL DEFAULT 0,
                    purchased_quota_used INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
                CREATE TABLE IF NOT EXISTS ai_admin_access_grants (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    granted_by_code TEXT NOT NULL,
                    starts_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    redeemed_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
                CREATE TABLE IF NOT EXISTS ai_payment_orders (
                    order_no TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    package_code TEXT NOT NULL,
                    amount_fen INTEGER NOT NULL,
                    quota_amount INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    wechat_transaction_id TEXT,
                    paid_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(wechat_transaction_id),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
                CREATE TABLE IF NOT EXISTS ai_admin_codes (
                    code TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    redeemed_by_user_id INTEGER,
                    redeemed_at TEXT,
                    created_at TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    FOREIGN KEY (redeemed_by_user_id) REFERENCES users(id)
                );
                CREATE TABLE IF NOT EXISTS ai_access_keys (
                    code TEXT PRIMARY KEY,
                    total_uses INTEGER NOT NULL,
                    used_count INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL,
                    expires_at TEXT,
                    created_at TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    last_used_at TEXT
                );
                CREATE TABLE IF NOT EXISTS ai_image_jobs (
                    ai_image_id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    quota_debited INTEGER NOT NULL DEFAULT 0,
                    used_free_access INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
                CREATE TABLE IF NOT EXISTS ai_key_image_jobs (
                    ai_image_id TEXT PRIMARY KEY,
                    access_code TEXT NOT NULL,
                    quota_debited INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (access_code) REFERENCES ai_access_keys(code)
                );
                """
            )
        self._initialized = True

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()


def create_database() -> Database:
    settings = load_settings()
    db = Database(settings.sqlite_db_path)
    db.initialize()
    return db


database = create_database()
