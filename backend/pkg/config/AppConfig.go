package config

import (
	"log/slog"
)

type AppConfig struct {
	Logger         *slog.Logger
	InProduction   bool
	UploadDir      string
	FrontendOrigin string
	LogLevel       string
	// RateLimitPerMinute is how many non-auth requests one direct peer may make in a
	// window. Zero means the default (see `defaultRateLimitPerMinute`), which is what
	// every test that builds an AppConfig by hand gets.
	RateLimitPerMinute int
}
