package config

import (
	"log/slog"
)

type AppConfig struct {
	Logger       *slog.Logger
	InProduction bool
	LogLevel     string
}
