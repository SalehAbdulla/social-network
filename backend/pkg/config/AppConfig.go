package config

import (
	"log/slog"
	"text/template"
)

type AppConfig struct {
	UseCache      bool
	TemplateCache map[string]*template.Template
	Logger        *slog.Logger
	InProduction  bool
	LogLevel      string
}