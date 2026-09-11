package handlers

import (
	"encoding/json"
	"fmt"
	"inter_map/api/internal/models"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ScheduleHandler struct {
	DB *pgxpool.Pool
}

func (h *ScheduleHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	query := `
		SELECT  lesson_id, teacher_id, teacher_name, date::text, weekday,
				lesson_number, time_start, time_end, subject, room_number,
				"group", week_type, cycle_week, replacement_type, bell_template
		FROM teacher_schedule
		WHERE 1=1
	`
	var args []any
	argN := 1

	if v := q.Get("teacher_id"); v != "" {
		query += fmt.Sprintf(` AND teacher_id = $%d`, argN)
		args = append(args, v)
		argN++
	}
	if v := q.Get("group"); v != "" {
		query += fmt.Sprintf(` AND "group" ILIKE '%%' || $%d || '%%'`, argN)
		args = append(args, v)
		argN++
	}
	if v := q.Get("date_from"); v != "" {
		query += fmt.Sprintf(` AND date >= $%d`, argN)
		args = append(args, v)
		argN++
	}
	if v := q.Get("date_to"); v != "" {
		query += fmt.Sprintf(` AND date <= $%d`, argN)
		args = append(args, v)
		argN++
	}

	limit := 500
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 2000 {
			limit = n
		}
	}
	query += fmt.Sprintf(` ORDER BY date, lesson_number LIMIT %d`, limit)

	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var result []models.Lesson
	for rows.Next() {
		var l models.Lesson
		if err := rows.Scan(
			&l.LessonID, &l.TeacherID, &l.TeacherName, &l.Date, &l.Weekday,
			&l.LessonNumber, &l.TimeStart, &l.TimeEnd, &l.Subject, &l.RoomNumber,
			&l.Group, &l.WeekType, &l.CycleWeek, &l.ReplacementType, &l.BellTemplate,
		); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		result = append(result, l)
	}

	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if result == nil {
		result = []models.Lesson{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *ScheduleHandler) Debug(w http.ResponseWriter, r *http.Request) {
	var count int
	err := h.DB.QueryRow(r.Context(), `SELECT COUNT(*) FROM teacher_schedule`).Scan(&count)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	fmt.Fprintf(w, "rows: %d\n", count)
}
