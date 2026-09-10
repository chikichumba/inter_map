import logging
import os
import re
import time
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urljoin

import psycopg2
import requests
from bs4 import BeautifulSoup


# ------------------------- Конфигурация -------------------------

PUBLICATION_ID = "01a00f53-d327-73b5-b396-bf3eb6f57ce2"

WEB_BASE = "https://site.mstimetables.ru"
API_BASE = "https://site.mstimetables.ru/api/publications"
TEACHERS_PAGE = f"{WEB_BASE}/{PUBLICATION_ID}/teachers"

TEACHERS_LINK_RE = re.compile(
    rf"^/{re.escape(PUBLICATION_ID)}/teachers/(?P<id>\d+)/?$"
)

REQUEST_TIMEOUT_SECONDS = 15
REQUEST_DELAY_SECONDS = 0.5
MAX_RETRIES = 5

# DSN берётся из переменной окружения, с фолбэком на локальные дефолты
# для разработки. Не храните боевые пароли в коде.
DB_DSN = os.environ.get(
    "COLLEGE_SCHEDULE_DB_DSN",
    "dbname=college_schedule user=postgres "
    "password=postgres host=localhost port=5432",
)

DEBUG_DIR = Path(__file__).with_name("debug")
DEBUG_DIR.mkdir(exist_ok=True)
DEBUG_TEACHERS_HTML = DEBUG_DIR / "teachers_page.html"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("teacher_schedule_parser")

# Общая сессия для переиспользования соединений
_session = requests.Session()


# ------------------------- Утилиты -------------------------

def current_week_range() -> tuple[str, str]:
    """Возвращает диапазон текущей недели: понедельник -> воскресенье."""
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    return monday.isoformat(), sunday.isoformat()


def fetch(url: str, params: dict | None = None, as_json: bool = True):
    """
    GET с задержкой и ретраями.

    Ретраятся только сетевые ошибки и серверные ошибки (5xx).
    Клиентские ошибки (4xx, например 404) не ретраятся, так как
    повторный запрос не изменит результат.
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = _session.get(
                url,
                params=params,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )

            if 400 <= resp.status_code < 500:
                log.error(
                    f"GET {url} - клиентская ошибка {resp.status_code}, "
                    "повторные попытки не имеют смысла"
                )
                return None

            resp.raise_for_status()
            return resp.json() if as_json else resp.text
        except requests.RequestException as err:
            log.warning(f"GET {url} - попытка {attempt}/{MAX_RETRIES} ({err})")
            if attempt < MAX_RETRIES:
                time.sleep(2 * attempt)

    log.error(f"GET {url} - не удалось после {MAX_RETRIES} попыток")
    return None


# ------------------------- Парсинг ссылок преподавателей -------------------------

def fetch_teacher_links() -> list[dict]:
    """
    Скачивает страницу /teachers и собирает список преподавателей.

    Возвращает:
        [{'id': '334', 'name': 'Алиева А.', 'url': '...'}, ...]
    """
    html = fetch(TEACHERS_PAGE, as_json=False)
    if not html:
        log.error("Не удалось получить страницу преподавателей")
        return []

    DEBUG_TEACHERS_HTML.write_text(html, encoding="utf-8")

    soup = BeautifulSoup(html, "html.parser")
    teachers: dict[str, dict] = {}

    for a in soup.select("a.teacher-link"):
        href = a.get("href", "").split("?", 1)[0]
        m = TEACHERS_LINK_RE.match(href)
        if not m:
            continue

        tid = m.group("id")
        teachers.setdefault(
            tid,
            {
                "id": tid,
                "name": a.get_text(strip=True) or tid,
                "url": urljoin(WEB_BASE, href),
            },
        )

    result = list(teachers.values())
    log.info(f"Найдено преподавателей: {len(result)}")

    if not result:
        log.error(
            "Ссылки не найдены (проверь селектор 'a.teacher-link' "
            f"и HTML в {DEBUG_TEACHERS_HTML})"
        )
    return result


# ------------------------- Парсинг расписания -------------------------

def fetch_teacher_lessons(
    teacher_id: str,
    start: str,
    end: str,
) -> dict | None:
    """Возвращает JSON с расписанием преподавателя за период."""
    url = f"{API_BASE}/{PUBLICATION_ID}/teachers/{teacher_id}/lessons"
    return fetch(url, params={"startDate": start, "endDate": end})


# ------------------------- Нормализация -------------------------

def _join_groups(union_groups: list | None) -> str:
    """Объединяет названия групп в одну строку через '; '."""
    if not union_groups:
        return ""

    names = []
    for ug in union_groups:
        group = ug.get("group") or {}
        name = group.get("name")
        if name:
            names.append(name)
    return "; ".join(names)


def normalize_lesson(raw: dict, teacher: dict) -> dict:
    """Преобразует сырые данные API в плоскую структуру для БД."""
    subject = raw.get("subject") or {}
    cabinet = raw.get("cabinet") or {}

    return {
        "lesson_id": raw.get("id"),
        "teacher_id": str(teacher["id"]),
        "teacher_name": teacher.get("fio", ""),
        "date": raw.get("date"),
        # API в остальных полях использует camelCase (startTime, weekType
        # и т.д.), поэтому здесь тоже пробуем camelCase-варианты в первую
        # очередь и падаем обратно на snake_case на всякий случай.
        # ВАЖНО: сверьте с реальным ответом API и уберите лишний вариант.
        "weekday": raw.get("weekDay", raw.get("weekday")),
        "lesson_number": raw.get("lessonNumber", raw.get("lesson_number")),
        "time_start": raw.get("startTime") or "",
        "time_end": raw.get("endTime") or "",
        "subject": subject.get("name") or "",
        "room_number": cabinet.get("name") or "",
        "group": _join_groups(raw.get("unionGroups")),
        "week_type": raw.get("weekType") or "",
        "cycle_week": raw.get("cycleWeek"),
        "replacement_type": raw.get("replacementType"),
        "bell_template": raw.get("bellTemplateName"),
    }


# ------------------------- Сохранение в БД -------------------------

def save_to_db(entries: list[dict]) -> None:
    """Апсертит занятия по ключу (lesson_id, teacher_id)."""
    if not entries:
        return

    data = [
        (
            e["lesson_id"], e["teacher_id"], e["teacher_name"],
            e["date"], e["weekday"], e["lesson_number"],
            e["time_start"], e["time_end"],
            e["subject"], e["room_number"], e["group"],
            e["week_type"], e["cycle_week"],
            e["replacement_type"], e["bell_template"],
        )
        for e in entries
    ]

    conn = psycopg2.connect(dsn=DB_DSN)
    try:
        with conn, conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO teacher_schedule
                    (lesson_id, teacher_id, teacher_name,
                     date, weekday, lesson_number,
                     time_start, time_end,
                     subject, room_number, "group",
                     week_type, cycle_week,
                     replacement_type, bell_template)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (lesson_id, teacher_id)
                DO UPDATE SET
                    teacher_name     = EXCLUDED.teacher_name,
                    date             = EXCLUDED.date,
                    weekday          = EXCLUDED.weekday,
                    lesson_number    = EXCLUDED.lesson_number,
                    time_start       = EXCLUDED.time_start,
                    time_end         = EXCLUDED.time_end,
                    subject          = EXCLUDED.subject,
                    room_number      = EXCLUDED.room_number,
                    "group"          = EXCLUDED."group",
                    week_type        = EXCLUDED.week_type,
                    cycle_week       = EXCLUDED.cycle_week,
                    replacement_type = EXCLUDED.replacement_type,
                    bell_template    = EXCLUDED.bell_template,
                    updated_at       = now()
                """,
                data,
            )
    finally:
        conn.close()


# ------------------------- Обработка одного преподавателя -------------------------

def process_teacher(teacher: dict, start: str, end: str) -> list[dict]:
    """Возвращает список нормализованных занятий преподавателя."""
    data = fetch_teacher_lessons(teacher["id"], start, end)
    if not isinstance(data, dict):
        return []

    raw_lessons = data.get("lessons") or []
    if not raw_lessons:
        return []

    api_teacher = data.get("teacher") or {}
    teacher_ctx = {
        "id": teacher["id"],
        "fio": api_teacher.get("fio") or teacher["name"],
    }

    return [normalize_lesson(item, teacher_ctx) for item in raw_lessons]


# ------------------------- Точка входа -------------------------

def run() -> None:
    start, end = current_week_range()
    log.info(f"Парсинг расписания преподавателей на {start} - {end}")

    teachers = fetch_teacher_links()
    if not teachers:
        log.error("Список преподавателей пуст")
        return

    all_entries: list[dict] = []
    failed = 0

    for i, teacher in enumerate(teachers, 1):
        try:
            entries = process_teacher(teacher, start, end)
            all_entries.extend(entries)
        except Exception as err:
            failed += 1
            log.exception(
                f"Преподаватель {teacher['id']} ({teacher['name']}): "
                f"ошибка - {err}"
            )

        if i % 20 == 0 or i == len(teachers):
            log.info(
                f"Обработано {i}/{len(teachers)} преподавателей, "
                f"записей: {len(all_entries)}, ошибок: {failed}"
            )

        time.sleep(REQUEST_DELAY_SECONDS)

    if not all_entries:
        log.info("Новых записей нет (без изменений на базе)")
        return

    save_to_db(all_entries)
    log.info(
        f"Готово: сохранено/обновлено {len(all_entries)} занятий "
        f"по {len(teachers)} преподавателям, ошибок: {failed}"
    )


if __name__ == "__main__":
    run()