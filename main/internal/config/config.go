package config

import (
	"fmt"
	"os"
)

type Config struct {
	DatabaseURL   string
	Port          string
	AllowedOrigin string
}

func Load() (*Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	origin := os.Getenv("ALLOWED_ORIGIN")
	if origin == "" {
		return nil, fmt.Errorf("ALLOWED_ORIGIN is required")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	return &Config{
		DatabaseURL:   dbURL,
		Port:          port,
		AllowedOrigin: origin,
	}, nil
}
