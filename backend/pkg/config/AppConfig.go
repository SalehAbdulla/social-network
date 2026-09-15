package config

import (
	"log/slog"
)

type AppConfig struct {
	Logger         *slog.Logger
	InProduction   bool
	DevDummyUser   bool
	UploadDir      string
	FrontendOrigin string
	LogLevel       string
}
