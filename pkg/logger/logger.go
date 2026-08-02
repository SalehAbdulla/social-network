package logger

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"runtime"

	"real-time-forum/pkg/config"
)

type stackTraceHandler struct {
	handler      slog.Handler
	inProduction bool
}

func (h *stackTraceHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.handler.Enabled(ctx, level)
}

func (h *stackTraceHandler) Handle(ctx context.Context, rec slog.Record) error {
	if rec.Level == slog.LevelError {
		stackBuf := make([]byte, 4096)
		n := runtime.Stack(stackBuf, false)

		if h.inProduction {
			rec.AddAttrs(slog.String("stack", string(stackBuf[:n])))
		} else {
			err := h.handler.Handle(ctx, rec)
			if err != nil {
				return err
			}
			fmt.Fprintf(os.Stdout, "\n--- Stack Trace ---\n%s-------------------\n\n", string(stackBuf[:n]))
			return nil
		}
	}
	return h.handler.Handle(ctx, rec)
}

func (h *stackTraceHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &stackTraceHandler{handler: h.handler.WithAttrs(attrs), inProduction: h.inProduction}
}

func (h *stackTraceHandler) WithGroup(name string) slog.Handler {
	return &stackTraceHandler{handler: h.handler.WithGroup(name), inProduction: h.inProduction}
}

func InitLogger(app *config.AppConfig) {
	level := slog.LevelInfo
	if app.LogLevel != "" {
		switch app.LogLevel {
		case "debug":
			level = slog.LevelDebug
		case "warn":
			level = slog.LevelWarn
		case "error":
			level = slog.LevelError
		}
	}

	opts := &slog.HandlerOptions{
		Level:     level,
		AddSource: !app.InProduction,
	}

	var baseHandler slog.Handler
	if app.InProduction {
		baseHandler = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		baseHandler = slog.NewTextHandler(os.Stdout, opts)
	}

	app.Logger = slog.New(&stackTraceHandler{handler: baseHandler, inProduction: app.InProduction})
	slog.SetDefault(app.Logger)
}