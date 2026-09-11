CREATE TABLE teacher_schedule (
    lesson_id INTEGER NOT NULL,
    teacher_id TEXT NOT NULL,
    teacher_name TEXT NOT NULL DEFAULT '',
    date DATE,
    weekday INTEGER,
    lesson_number INTEGER,
    time_start TEXT,
    time_end TEXT,
    subject TEXT,
    room_number TEXT,
    "group" TEXT,
    week_type TEXT,
    cycle_week INTEGER,
    replacement_type TEXT,
    bell_template TEXT,
    updated_at TEXT,
    PRIMARY KEY (lesson_id, teacher_id)
);

CREATE INDEX idx_teacher_schedule_teacher ON teacher_schedule (teacher_id);
CREATE INDEX idx_teacher_schedule_group ON teacher_schedule ("group");
CREATE INDEX idx_teacher_schedule_date ON teacher_schedule (date);