package main

import (
	"context"
	"inter_map/api/internal/config"
	"inter_map/api/internal/db"
	"inter_map/api/internal/handlers"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi"
	"github.com/go-chi/chi/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
	"github.com/labstack/echo/middleware"
	"github.com/labstack/echo/v4/middleware"
)

func main() {
	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	ctx := context.Background()
	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db error: %v", err)
	}
	defer pool.Close()

	scheduleH := &handlers.ScheduleHandler{DB: pool}
	healthH := &handlers.HealthHandler{DB: pool}

	r := chi.NewRouter
	r.Use(middleware.Logger)
	r.Use(middleware.Recover)
	r.Use(middleware.Timeout(10 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{cfg.AllowedOrigin},
		AllowedMethods: []string{"GET", "OPTIONS"},
	}))

	r.Get("/healthz", healthH.Check)
	r.Get("/api/lessons", scheduleH.List)

	log.Printf("listening on :%s", cfg.Port)
	log.Fatal(http.ListenAndServe(":"+cfg.Port, r))
}
