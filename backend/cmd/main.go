package main

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"

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
	app.DevDummyUser = !app.InProduction && os.Getenv("DEV_DUMMY_USER") == "true"
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

	wsHub := pkgwebsocket.NewHub()
	hc.SetHub(wsHub)
	go wsHub.Run()

	app.Logger.Info("starting application", "port", config.PORT_NUMBER)

	serve := &http.Server{
		Addr:    config.PORT_NUMBER,
		Handler: routes(),
	}

	err = serve.ListenAndServe()
	if err != nil {
		app.Logger.Error("server failed", "error", err)
		os.Exit(1)
	}
}
