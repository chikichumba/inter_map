package config

import (
	"os"
	"strings"
)

type Config struct {
	DatabaseURL    string
	Port           string
	AllowedOrigins []string
}

func Load() (*Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/college_schedule?sslmode=disable"
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	var origins []string
	if raw := os.Getenv("ALLOWED_ORIGINS"); raw != "" {
		for _, o := range strings.Split(raw, ",") {
			origins = append(origins, strings.TrimSpace(o))
		}
	} else {
		origins = []string{"*"}
	}

	return &Config{
		DatabaseURL:    dbURL,
		Port:           port,
		AllowedOrigins: origins,
	}, nil

}
