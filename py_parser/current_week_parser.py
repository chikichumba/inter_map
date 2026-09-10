"""
Парсер расписания mstimetables -> PostgreSQL.

Запускать ЕЖЕДНЕВНО через cron/Планировщик заданий.
Парсит расписание на ТЕКУЩУЮ неделю.
"""

import json
import logging
import time
from datetime import date, timedelta
from pathlib import Path

import psycopg2
import requests
from psycopg2.extras import execute_values


PUBLICATION_ID = "01a00f53-d327-73b5-b396-bf3eb6f57ce2"

GROUPS = {
    309: "05-25.РИУПО.ОФ.9 06-25.РИУПО.ОФ.9",
}

BASE_URL = "https://site.mstimetables.ru/api/publications/{pub}/groups/{group}/lessons"
REQUEST_TIMEOUT_SECONDS = 15
REQUEST_DELAY_SECONDS = 0.5
MAX_RETRIES = 3

DB_DSN = "dbname=college_schedule user=postgres password=postgres host=localhost port=5432"

DEBUG_DUMP_PATH = Path(__file__).with_name("last_raw_lesson.json")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("schedule_parser")


def current_week_range() -> tuple[str, str]:
    """Понедельник и воскресенье ТЕКУЩЕЙ недели в формате YYYY-MM-DD."""
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    return monday.isoformat(), sunday.isoformat()


def fetch_lessons(group_id: int, start: str, end: str) -> dict | None:
    url = BASE_URL.format(pub=PUBLICATION_ID, group=group_id)
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(
                url,
                params={"startDate": start, "endDate": end},
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as err:
            log.warning(f"Группа {group_id}: попытка {attempt}/{MAX_RETRIES} не удалась ({err})")
            time.sleep(2 * attempt)
    log.error(f"Группа {group_id}: не удалось получить данные после {MAX_RETRIES} попыток")
    return None


def _extract_string(value, default=""):
    """Извлекает строку из возможного словаря или None."""
    if value is None:
        return default
    if isinstance(value, dict):
        # Ищем первое строковое поле в словаре
        for key in ("name", "fullName", "title", "value", "number"):
            if key in value and isinstance(value[key], str):
                return value[key]
        # Если ничего не нашли, возвращаем строковое представление всего словаря
        return str(value)
    return str(value)


def normalize_lesson(raw: dict, group_id: int, group_name: str) -> dict:
    return {
        "group_id": group_id,
        "group_name": group_name,
        "date": _extract_string(raw.get("date") or raw.get("day")),
        "time_start": _extract_string(raw.get("startTime") or raw.get("timeStart") or raw.get("start")),
        "time_end": _extract_string(raw.get("endTime") or raw.get("timeEnd") or raw.get("end")),
        "subject": _extract_string(raw.get("disciplineName") or raw.get("subject") or raw.get("name")),
        "teacher": _extract_string(raw.get("teacherName") or (raw.get("teacher") or {}).get("name")),
        "room_number": _extract_string(raw.get("roomNumber") or (raw.get("room") or {}).get("number")),
    }


def save_to_db(entries: list[dict]) -> None:
    if not entries:
        return

    # Преобразуем словари в кортежи и явно проверяем типы
    data = []
    for e in entries:
        # Убедимся, что все значения – строки (они уже должны быть такими)
        row = (
            e["group_id"], e["group_name"], e["date"],
            e["time_start"], e["time_end"], e["subject"],
            e["room_number"], e["teacher"],
        )
        # Отладочный вывод первого элемента (можно убрать после проверки)
        if not data:
            log.info(f"Первый кортеж: {row}")
            log.info(f"Типы значений: {[type(x) for x in row]}")
        data.append(row)

    conn = psycopg2.connect(dsn=DB_DSN)
    try:
        with conn, conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO schedule
                    (group_id, group_name, date, time_start, time_end, subject, room_number, teacher)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (group_id, date, time_start, room_number)
                DO UPDATE SET
                    subject    = EXCLUDED.subject,
                    teacher    = EXCLUDED.teacher,
                    group_name = EXCLUDED.group_name,
                    updated_at = now()
                """,
                data,
            )
    finally:
        conn.close()


def process_group(group_id: int, group_name: str, start: str, end: str) -> list[dict]:
    data = fetch_lessons(group_id, start, end)

    if data is None:
        return []

    if not data.get("group", {}).get("id"):
        log.error(f"Группа {group_id}: неожиданный ответ API (нет group.id) — {data}")
        return []

    raw_lessons = data.get("lessons", [])
    if not raw_lessons:
        log.info(f"Группа {group_id} ({group_name}): расписание на {start}–{end} пока не утверждено")
        return []

    if not DEBUG_DUMP_PATH.exists():
        DEBUG_DUMP_PATH.write_text(
            json.dumps(raw_lessons[0], ensure_ascii=False, indent=2), encoding="utf-8"
        )
        log.info(f"Сохранил пример сырого занятия в {DEBUG_DUMP_PATH} — сверьте поля в normalize_lesson()")

    return [normalize_lesson(item, group_id, group_name) for item in raw_lessons]


def run() -> None:
    start, end = current_week_range()
    log.info(f"Парсинг расписания на {start} – {end} (текущая неделя)")

    all_entries: list[dict] = []
    for group_id, group_name in GROUPS.items():
        all_entries.extend(process_group(group_id, group_name, start, end))
        time.sleep(REQUEST_DELAY_SECONDS)

    if not all_entries:
        log.info("Новых записей нет — база не изменена")
        return

    save_to_db(all_entries)
    log.info(f"Готово: сохранено/обновлено {len(all_entries)} занятий по {len(GROUPS)} группам")


if __name__ == "__main__":
    run()