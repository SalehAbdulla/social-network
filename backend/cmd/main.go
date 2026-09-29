package main

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"social-network/backend/pkg/app/handlers"
	db "social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/app/service"
	"social-network/backend/pkg/config"
	sqlitedb "social-network/backend/pkg/db/sqlite"
	"social-network/backend/pkg/logger"
	pkgwebsocket "social-network/backend/pkg/websocket"
)

var app config.AppConfig

func main() {
	app.InProduction = os.Getenv("APP_ENV") == "production"
	app.UploadDir = os.Getenv("UPLOAD_DIR")
	app.FrontendOrigin = os.Getenv("FRONTEND_ORIGIN")
	if app.FrontendOrigin == "" {
		app.FrontendOrigin = "http://localhost:4000"
	}
	app.LogLevel = os.Getenv("LOG_LEVEL")

	logger.InitLogger(&app)

	backendDir, err := config.BackendDir()
	if err != nil {
		app.Logger.Error("failed to locate backend files", "error", err)
		os.Exit(1)
	}
	if app.UploadDir == "" {
		app.UploadDir = filepath.Join(backendDir, "uploads")
	}
	databasePath := filepath.Join(backendDir, "pkg", "db", "socialnetwork.db")
	if configured := os.Getenv("DATABASE_PATH"); configured != "" {
		databasePath = configured
	}
	database, err := sql.Open("sqlite3", databasePath+"?_foreign_keys=on&_busy_timeout=5000")
	if err != nil {
		app.Logger.Error("failed to open database", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	dbConn := &db.DB{Conn: database}

	if err := sqlitedb.RunMigrations(database); err != nil {
		app.Logger.Error("failed to run database migrations", "error", err)
		os.Exit(1)
	}

	// Sessions outlive the process, so a restart no longer signs everyone out.
	service.DefaultSessionManager.UseStore(dbConn)
	go func() {
		cleanup := func() {
			removed, err := service.DefaultSessionManager.CleanupExpired()
			if err != nil {
				app.Logger.Error("session cleanup failed", "error", err)
				return
			}
			if removed > 0 {
				app.Logger.Info("expired sessions removed", "count", removed)
			}
		}
		cleanup()
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			cleanup()
		}
	}()

	authService := service.NewAuthService(dbConn)
	reactService := service.NewReactionService(dbConn)
	postService := service.NewPostService(dbConn, reactService)
	commentService := service.NewCommentService(dbConn)
	messageService := service.NewMessageService(dbConn, dbConn)
	notificationService := service.NewNotificationService(dbConn)

	hc := handlers.NewHandlerContext(&app, authService, postService, commentService, reactService, messageService, notificationService)
	hc.SocialService = &service.SocialService{Repo: dbConn}
	hc.GroupService = &service.GroupService{Repo: dbConn}
	handlers.SetHandlerContext(hc)

	// Uploads that nothing references any more — a deleted post, comment, story
	// or message, or an upload that was never attached — are swept at boot and
	// then hourly, the same shape as the session cleanup above. The grace window
	// is what keeps a file that was just uploaded but not yet attached safe.
	go func() {
		prune := func() {
			result, err := hc.PruneOrphanedMedia(handlers.MediaGrace)
			if err != nil {
				app.Logger.Error("media cleanup failed", "error", err)
				return
			}
			if result.Rows > 0 || result.Files > 0 {
				app.Logger.Info("orphaned media removed", "rows", result.Rows, "files", result.Files)
			}
		}
		prune()
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			prune()
		}
	}()

	// Event reminders go out an hour before an event starts, checked every few
	// minutes: the sweep is one query and the stamp makes a repeat harmless, so a
	// short interval costs nothing and keeps the timing tight.
	go func() {
		remind := func() {
			result, err := hc.SendEventReminders(time.Now().UTC(), handlers.EventReminderLead)
			if err != nil {
				app.Logger.Error("event reminders failed", "error", err)
				return
			}
			if result.Events > 0 {
				app.Logger.Info("event reminders sent", "events", result.Events, "members", result.Members)
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

	app.Logger.Info("starting application", "port", config.PORT_NUMBER)

	serve := &http.Server{
		Addr:              config.PORT_NUMBER,
		Handler:           routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	err = serve.ListenAndServe()
	if err != nil {
		app.Logger.Error("server failed", "error", err)
		os.Exit(1)
	}
}
