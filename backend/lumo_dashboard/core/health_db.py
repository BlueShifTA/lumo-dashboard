"""SQLite cache for Garmin health data and chat history."""

import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path

log = logging.getLogger(__name__)

_DB_DIR = Path.home() / ".lumo"
_DB_PATH = _DB_DIR / "health.db"


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create ~/.lumo dir and initialize health.db tables."""
    _DB_DIR.mkdir(parents=True, exist_ok=True)
    with _get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS daily_metrics (
                date TEXT PRIMARY KEY,
                sleep_score REAL,
                hrv_avg REAL,
                body_battery_max REAL,
                stress_avg REAL,
                steps INTEGER,
                resting_hr REAL,
                json_blob TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )
        """)
        conn.commit()
    log.info("health.db initialized at %s", _DB_PATH)


def save_daily_metrics(date: str, data: dict) -> None:
    """Insert or replace daily metrics row."""
    with _get_conn() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO daily_metrics
                (date, sleep_score, hrv_avg, body_battery_max, stress_avg, steps, resting_hr, json_blob)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                date,
                data.get("sleep_score"),
                data.get("hrv_avg"),
                data.get("body_battery_max"),
                data.get("stress_avg"),
                data.get("steps"),
                data.get("resting_hr"),
                json.dumps(data),
            ),
        )
        conn.commit()


def get_metrics(start_date: str, end_date: str) -> list[dict]:
    """Return daily_metrics rows between start_date and end_date inclusive."""
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM daily_metrics WHERE date BETWEEN ? AND ? ORDER BY date",
            (start_date, end_date),
        ).fetchall()
    return [dict(r) for r in rows]


def save_message(session_id: str, role: str, content: str) -> None:
    """Append a chat message to history."""
    with _get_conn() as conn:
        conn.execute(
            "INSERT INTO chat_history (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
            (session_id, role, content, datetime.utcnow().isoformat()),
        )
        conn.commit()


def get_recent_messages(session_id: str, n: int = 5) -> list[dict]:
    """Return the last n messages for a session, oldest first."""
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT role, content, timestamp FROM chat_history
            WHERE session_id = ?
            ORDER BY id DESC LIMIT ?
            """,
            (session_id, n),
        ).fetchall()
    return [dict(r) for r in reversed(rows)]
