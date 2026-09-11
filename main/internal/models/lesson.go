package models

type Lesson struct {
	LessonID        int     `json:"lesson_id"`
	TeacherID       string  `json:"teacher_id"`
	TeacherName     string  `json:"teacher_name"`
	Date            *string `json:"date"`
	Weekday         *int    `json:"weekday"`
	LessonNumber    *int    `json:"lesson_number"`
	TimeStart       string  `json:"time_start"`
	TimeEnd         string  `json:"time_end"`
	Subject         string  `json:"subject"`
	RoomNumber      string  `json:"room_number"`
	Group           string  `json:"group"`
	WeekType        string  `json:"week_type"`
	CycleWeek       *int    `json:"cycle_week"`
	ReplacementType *string `json:"replacement_type"`
	BellTemplate    *string `json:"bell_template"`
}
