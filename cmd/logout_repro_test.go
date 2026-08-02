package main

import (
	"database/sql"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"testing"
	"time"

	"real-time-forum/pkg/app/handlers"
	"real-time-forum/pkg/app/repositories"
	"real-time-forum/pkg/app/service"
	"real-time-forum/pkg/config"
	"real-time-forum/pkg/logger"
	pkgmiddleware "real-time-forum/pkg/middleware"
	"real-time-forum/pkg/render"
	pkgwebsocket "real-time-forum/pkg/websocket"

	"github.com/gorilla/websocket"
	_ "github.com/mattn/go-sqlite3"
)

// Reproduces the logout flow:
// 1. alice & bob register + connect WS
// 2. alice sends {"type":"user_offline","payload":{}} exactly like profile.js ws.send('user_offline')
// 3. we observe what bob receives
func TestLogoutOfflineBroadcast(t *testing.T) {
	origDir, _ := os.Getwd()
	os.Chdir("..")
	defer os.Chdir(origDir)

	app = config.AppConfig{}
	app.InProduction = false
	app.UseCache = false

	logger.InitLogger(&app)

	templateCache, err := render.CreateTemplateCache()
	if err != nil {
		t.Fatalf("failed to create template cache: %v", err)
	}
	app.TemplateCache = templateCache
	render.NewTemplates(&app)

	database, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("failed to open in-memory database: %v", err)
	}
	defer database.Close()

	if _, err = database.Exec(testSchema); err != nil {
		t.Fatalf("failed to execute schema: %v", err)
	}

	dbConn := &repositories.DB{Conn: database}
	authService := service.NewAuthService(dbConn)
	messageService := service.NewMessageService(dbConn, dbConn)
	notificationService := service.NewNotificationService(dbConn)

	hc := handlers.NewHandlerContext(&app, authService, nil, nil, nil, nil, messageService, notificationService)
	handlers.SetHandlerContext(hc)

	wsHub := pkgwebsocket.NewHub()
	hc.SetHub(wsHub)
	go wsHub.Run()

	wsHandler := pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.ServeWs))
	mainMux := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/auth/register":
			handlers.HandlerCtx.Register(w, r)
		case "/ws":
			wsHandler.ServeHTTP(w, r)
		default:
			http.NotFound(w, r)
		}
	})

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen: %v", err)
	}
	server := &http.Server{Handler: mainMux}
	go server.Serve(listener)
	defer server.Close()
	defer listener.Close()

	baseURL := "http://" + listener.Addr().String()
	wsURL := "ws://" + listener.Addr().String() + "/ws"

	aliceID, aliceToken := registerTestUser(t, baseURL, "alice", "alice@x.com", "AlicePass123!@#")
	bobID, bobToken := registerTestUser(t, baseURL, "bob", "bob@x.com", "BobPass456!@#")
	t.Logf("alice id=%s bob id=%s", aliceID, bobID)

	wsAlice := dialWebSocket(t, wsURL, aliceToken)
	defer wsAlice.Close()
	wsBob := dialWebSocket(t, wsURL, bobToken)
	defer wsBob.Close()

	time.Sleep(300 * time.Millisecond)

	// Alice connected first, so alice should have received "bob online".
	// This proves the broadcast pipeline works.
	drainUntilUserStatus(t, wsAlice, bobID, 1, 2*time.Second)
	t.Log("alice saw bob come ONLINE (broadcast pipeline works)")

	// === Simulate profile.js logout: ws.send('user_offline') ===
	logoutMsg := map[string]interface{}{"type": "user_offline", "payload": map[string]string{}}
	data, _ := json.Marshal(logoutMsg)
	if err := wsAlice.WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatalf("alice failed to send user_offline: %v", err)
	}

	// Now check: does bob receive user_status {userId: alice, isOnline: 0} ?
	drainUntilUserStatus(t, wsBob, aliceID, 0, 2*time.Second)
	t.Log("PASS: bob saw alice go OFFLINE instantly")
}

func drainUntilUserStatus(t *testing.T, conn *websocket.Conn, wantUserID string, wantOnline int, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	conn.SetReadDeadline(deadline)
	for time.Now().Before(deadline) {
		var msg rawWSMessage
		if err := conn.ReadJSON(&msg); err != nil {
			t.Fatalf("read error waiting for user_status(online=%d): %v", wantOnline, err)
		}
		if msg.Type != pkgwebsocket.MsgTypeUserStatus {
			t.Logf("  [drained %s]", msg.Type)
			continue
		}
		var p pkgwebsocket.UserStatusPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			t.Fatalf("bad user_status payload: %v", err)
		}
		t.Logf("  user_status received: userId=%s isOnline=%d", p.UserId, p.IsOnline)
		if p.UserId == wantUserID && p.IsOnline == wantOnline {
			return
		}
	}
	t.Fatalf("timed out waiting for user_status userId=%s isOnline=%d", wantUserID, wantOnline)
}
