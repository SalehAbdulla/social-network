package main

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"social-network/backend/pkg/app/handlers"
	db "social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/app/service"
	"social-network/backend/pkg/config"
	sqlitedb "social-network/backend/pkg/db/sqlite"
	"social-network/backend/pkg/logger"
	"social-network/backend/pkg/web"
	pkgwebsocket "social-network/backend/pkg/websocket"
)

func main() {
	web.App.InProduction = os.Getenv("APP_ENV") == "production"
	web.App.UploadDir = os.Getenv("UPLOAD_DIR")
	web.App.FrontendOrigin = os.Getenv("FRONTEND_ORIGIN")
	if web.App.FrontendOrigin == "" {
		web.App.FrontendOrigin = "http://localhost:4000"
	}
	web.App.LogLevel = os.Getenv("LOG_LEVEL")

	logger.InitLogger(&web.App)

	if configured := os.Getenv("RATE_LIMIT_PER_MINUTE"); configured != "" {
		parsed, err := strconv.Atoi(configured)
		if err != nil || parsed <= 0 {
			web.App.Logger.Error("ignoring invalid RATE_LIMIT_PER_MINUTE", "value", configured)
		} else {
			web.App.RateLimitPerMinute = parsed
		}
	}

	backendDir, err := config.BackendDir()
	if err != nil {
		web.App.Logger.Error("failed to locate backend files", "error", err)
		os.Exit(1)
	}
	if web.App.UploadDir == "" {
		web.App.UploadDir = filepath.Join(backendDir, "uploads")
	}
	databasePath := filepath.Join(backendDir, "pkg", "db", "socialnetwork.db")
	if configured := os.Getenv("DATABASE_PATH"); configured != "" {
		databasePath = configured
	}
	// foreign keys are off unless asked for, and a locked write should wait rather than fail
	database, err := sql.Open("sqlite3", databasePath+"?_foreign_keys=on&_busy_timeout=5000")
	if err != nil {
		web.App.Logger.Error("failed to open database", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	dbConn := &db.DB{Conn: database}

	if err := sqlitedb.RunMigrations(database); err != nil {
		web.App.Logger.Error("failed to run database migrations", "error", err)
		os.Exit(1)
	}

	service.DefaultSessionManager.UseStore(dbConn)
	go func() {
		cleanup := func() {
			removed, err := service.DefaultSessionManager.CleanupExpired()
			if err != nil {
				web.App.Logger.Error("session cleanup failed", "error", err)
				return
			}
			if removed > 0 {
				web.App.Logger.Info("expired sessions removed", "count", removed)
			}
		}
		cleanup()
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			cleanup()
		}
	}()
	go func() {
		purge := func() {
			removed, err := dbConn.DeleteExpiredPasswordResets(time.Now().UTC())
			if err != nil {
				web.App.Logger.Error("password reset cleanup failed", "error", err)
				return
			}
			if removed > 0 {
				web.App.Logger.Info("expired password reset tokens removed", "count", removed)
			}
		}
		purge()
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			purge()
		}
	}()

	authService := service.NewAuthService(dbConn)
	reactService := service.NewReactionService(dbConn)
	postService := service.NewPostService(dbConn, reactService)
	commentService := service.NewCommentService(dbConn)
	messageService := service.NewMessageService(dbConn, dbConn)
	notificationService := service.NewNotificationService(dbConn)

	hc := handlers.NewHandlerContext(&web.App, authService, postService, commentService, reactService, messageService, notificationService)
	hc.SocialService = &service.SocialService{Repo: dbConn}
	hc.GroupService = &service.GroupService{Repo: dbConn}

	var mailer service.Mailer
	if host := os.Getenv("SMTP_HOST"); host != "" {
		port := os.Getenv("SMTP_PORT")
		if port == "" {
			port = "587"
		}
		from := os.Getenv("SMTP_FROM")
		if from == "" {
			from = "no-reply@" + host
		}
		mailer = service.SMTPMailer{
			Host:     host,
			Port:     port,
			Username: os.Getenv("SMTP_USERNAME"),
			Password: os.Getenv("SMTP_PASSWORD"),
			From:     from,
		}
	} else if !web.App.InProduction {
		mailer = service.LogMailer{Logger: web.App.Logger}
	}
	hc.PasswordResetService = service.NewPasswordResetService(dbConn, service.DefaultSessionManager, mailer, web.App.FrontendOrigin)
	if mailer == nil {
		web.App.Logger.Warn("password reset is unavailable: set SMTP_HOST to enable it")
	} else {
		web.App.Logger.Info("password reset delivery configured", "delivery", mailer.Describe())
	}
	handlers.SetHandlerContext(hc)

	go func() {
		prune := func() {
			result, err := hc.PruneOrphanedMedia(handlers.MediaGrace)
			if err != nil {
				web.App.Logger.Error("media cleanup failed", "error", err)
				return
			}
			if result.Rows > 0 || result.Files > 0 {
				web.App.Logger.Info("orphaned media removed", "rows", result.Rows, "files", result.Files)
			}
		}
		prune()
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			prune()
		}
	}()

	go func() {
		remind := func() {
			result, err := hc.SendEventReminders(time.Now().UTC(), handlers.EventReminderLead)
			if err != nil {
				web.App.Logger.Error("event reminders failed", "error", err)
				return
			}
			if result.Events > 0 {
				web.App.Logger.Info("event reminders sent", "events", result.Events, "members", result.Members)
			}
		}
		remind()
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			remind()
		}
	}()

	wsHub := pkgwebsocket.NewHub()
	hc.SetHub(wsHub)
	go wsHub.Run()

	web.App.Logger.Info("starting application", "port", config.PORT_NUMBER)

	serve := &http.Server{
		Addr:              config.PORT_NUMBER,
		Handler:           web.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	err = serve.ListenAndServe()
	if err != nil {
		web.App.Logger.Error("server failed", "error", err)
		os.Exit(1)
	}
}
