package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
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

const testSchema = `
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS message;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS reaction;
DROP TABLE IF EXISTS comment;
DROP TABLE IF EXISTS post;
DROP TABLE IF EXISTS category;
DROP TABLE IF EXISTS user;

DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS reactions;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;

VACUUM;
PRAGMA foreign_keys = ON;

CREATE TABLE user (
    userId          TEXT PRIMARY KEY,
    nickName        TEXT NOT NULL UNIQUE,
    firstName       TEXT NOT NULL,
    lastName        TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    hashedPassword  TEXT NOT NULL,
    yearOfBirth     INTEGER NOT NULL,
    gender          TEXT CHECK(gender IN ('male', 'female')),
    createdAt       TEXT DEFAULT (CURRENT_TIMESTAMP),
    updatedAt       TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE category (
    categoryId      INTEGER PRIMARY KEY AUTOINCREMENT,
    categoryName    TEXT NOT NULL UNIQUE
);

insert into category (categoryName) values ("General");
insert into category (categoryName) values ("Tech");
insert into category (categoryName) values ("Dev");
insert into category (categoryName) values ("Gaming");
insert into category (categoryName) values ("Help");
insert into category (categoryName) values ("Life");
insert into category (categoryName) values ("Sport");
insert into category (categoryName) values ("Misc");

CREATE TABLE post (
    postId           INTEGER PRIMARY KEY AUTOINCREMENT,
    userId           TEXT NOT NULL,
    title            TEXT NOT NULL,
    content          TEXT NOT NULL,
    categoryId       INTEGER NOT NULL,
    score            INTEGER DEFAULT 0,
    commentsCounter  INTEGER DEFAULT 0,
    createdAt        TEXT DEFAULT (CURRENT_TIMESTAMP),
    updatedAt        TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (userId) REFERENCES user(userId) ON DELETE CASCADE,
    FOREIGN KEY (categoryId) REFERENCES category(categoryId) ON DELETE RESTRICT
);

CREATE TABLE comment (
    commentId   INTEGER PRIMARY KEY AUTOINCREMENT,
    postId      INTEGER NOT NULL,
    userId      TEXT NOT NULL,
    commentText TEXT NOT NULL,
    score       INTEGER DEFAULT 0,                
    createdAt   TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (postId) REFERENCES post(postId) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES user(userId) ON DELETE CASCADE
);

CREATE TABLE reaction (
    reactionId  INTEGER PRIMARY KEY AUTOINCREMENT,
    userId      TEXT NOT NULL,
    entityType  TEXT NOT NULL CHECK(entityType IN ('post', 'comment')),
    entityId    INTEGER NOT NULL,
    score       INTEGER NOT NULL CHECK(score IN (1, -1)),
    createdAt   TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (userId) REFERENCES user(userId) ON DELETE CASCADE,
    
    UNIQUE(userId, entityType, entityId)
);

CREATE TABLE session (
    sessionToken TEXT PRIMARY KEY,
    userId       TEXT NOT NULL UNIQUE,
    timeStamp    TEXT DEFAULT (CURRENT_TIMESTAMP),
    createdAt    TEXT DEFAULT (CURRENT_TIMESTAMP),
    expiredAt    TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES user(userId) ON DELETE CASCADE
);

CREATE TABLE message (
    messageId   INTEGER PRIMARY KEY AUTOINCREMENT,
    senderId    TEXT NOT NULL,
    recipientId TEXT NOT NULL,
    textMessage TEXT NOT NULL,
    timeStamp   TEXT DEFAULT (CURRENT_TIMESTAMP),
    isRead      INTEGER DEFAULT 0 CHECK(isRead IN (0, 1)),
    FOREIGN KEY (senderId) REFERENCES user(userId) ON DELETE CASCADE,
    FOREIGN KEY (recipientId) REFERENCES user(userId) ON DELETE CASCADE
);

CREATE TABLE notification (
    notificationId  INTEGER PRIMARY KEY AUTOINCREMENT,
    userId          TEXT NOT NULL,
    actorId         TEXT,
    entityType      TEXT NOT NULL CHECK(entityType IN ('comment', 'message')),
    entityId        INTEGER NOT NULL,
    isRead          INTEGER DEFAULT 0 CHECK(isRead IN (0, 1)),
    createdAt       TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (userId) REFERENCES user(userId) ON DELETE CASCADE,
    FOREIGN KEY (actorId) REFERENCES user(userId) ON DELETE SET NULL
);

CREATE INDEX idx_messages_chat_flow 
ON message (senderId, recipientId, timeStamp DESC);

CREATE INDEX idx_reactions_lookup 
ON reaction (entityType, entityId);

CREATE INDEX idx_posts_category 
ON post (categoryId);

CREATE INDEX idx_post_userId ON post (userId);
CREATE INDEX idx_comment_postId ON comment (postId);
CREATE INDEX idx_comment_userId ON comment (userId);

CREATE INDEX idx_notifications_user 
ON notification (userId, isRead, createdAt DESC);
`

func TestWebSocketPrivateMessage(t *testing.T) {
	
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

	_, err = database.Exec(testSchema)
	if err != nil {
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
	messagesHandler := pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetChatMessages))
	mainMux := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/auth/register":
			handlers.HandlerCtx.Register(w, r)
		case "/api/v1/auth/login":
			handlers.HandlerCtx.Login(w, r)
		case "/api/v1/messages":
			messagesHandler.ServeHTTP(w, r)
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

	
	user1ID, token1 := registerTestUser(t, baseURL, "testuser1", "user1@test.com", "TestPass123!@#")
	user2ID, token2 := registerTestUser(t, baseURL, "testuser2", "user2@test.com", "TestPass123!@#")

	t.Logf("user1: id=%s, token=%s", user1ID, token1)
	t.Logf("user2: id=%s, token=%s", user2ID, token2)

	
	ws1 := dialWebSocket(t, wsURL, token1)
	defer ws1.Close()

	ws2 := dialWebSocket(t, wsURL, token2)
	defer ws2.Close()

	
	time.Sleep(200 * time.Millisecond)

	
	privateMsg := map[string]interface{}{
		"type": "private_msg",
		"payload": map[string]string{
			"recipientId": user2ID,
			"text":        "Hello, user2!",
		},
	}
	msgBytes, _ := json.Marshal(privateMsg)
	err = ws1.WriteMessage(websocket.TextMessage, msgBytes)
	if err != nil {
		t.Fatalf("ws1 write error: %v", err)
	}

	
	time.Sleep(200 * time.Millisecond)

	
	messagesResp := getMessages(t, baseURL, token1, user2ID, 0, 10)
	msgs := messagesResp.Data.Messages
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message, got %d", len(msgs))
	}

	msg := msgs[0]
	if msg.SenderId != user1ID {
		t.Fatalf("expected senderId %s, got %s", user1ID, msg.SenderId)
	}
	if msg.RecipientId != user2ID {
		t.Fatalf("expected recipientId %s, got %s", user2ID, msg.RecipientId)
	}
	if msg.TextMessage != "Hello, user2!" {
		t.Fatalf("expected text 'Hello, user2!', got '%s'", msg.TextMessage)
	}
	t.Logf("message verified: sender=%s, recipient=%s, text=%s", msg.SenderId, msg.RecipientId, msg.TextMessage)

	
	messagesResp2 := getMessages(t, baseURL, token2, user1ID, 0, 10)
	msgs2 := messagesResp2.Data.Messages
	if len(msgs2) != 1 {
		t.Fatalf("user2: expected 1 message, got %d", len(msgs2))
	}
	t.Log("message visible from both user perspectives: PASS")
}

func TestChatSimulationDryRun(t *testing.T) {
	
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

	_, err = database.Exec(testSchema)
	if err != nil {
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
	messagesHandler := pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetChatMessages))
	mainMux := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/auth/register":
			handlers.HandlerCtx.Register(w, r)
		case "/api/v1/auth/login":
			handlers.HandlerCtx.Login(w, r)
		case "/api/v1/messages":
			messagesHandler.ServeHTTP(w, r)
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

	
	t.Run("Phase1_UnauthenticatedRejected", func(t *testing.T) {
		_, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err == nil {
			t.Fatal("expected unauthenticated WS dial to fail, but it succeeded")
		}
		t.Logf("unauthenticated WS correctly rejected: %v", err)
	})

	
	user1ID, token1 := registerTestUser(t, baseURL, "alice", "alice@chat.com", "AlicePass123!@#")
	user2ID, token2 := registerTestUser(t, baseURL, "bob", "bob@chat.com", "BobPass456!@#")

	t.Logf("alice: id=%s, token=%s", user1ID, token1)
	t.Logf("bob:   id=%s, token=%s", user2ID, token2)

	
	wsAlice := dialWebSocket(t, wsURL, token1)
	defer wsAlice.Close()

	wsBob := dialWebSocket(t, wsURL, token2)
	defer wsBob.Close()

	time.Sleep(200 * time.Millisecond)

	
	
	
	t.Run("Phase4_AliceSendsFirstMessage", func(t *testing.T) {
		sendPrivateMsg(t, wsAlice, user2ID, "Hey Bob, how are you?")
		time.Sleep(200 * time.Millisecond)

		
		echo := readWSMessage(t, wsAlice, 2*time.Second)
		verifyIncomingMsg(t, echo, user1ID, "Hey Bob, how are you?")
		t.Log("  [drained sender echo on alice]")

		
		msg := readWSMessage(t, wsBob, 2*time.Second)
		verifyIncomingMsg(t, msg, user1ID, "Hey Bob, how are you?")

		
		assertConversationLength(t, baseURL, token1, user2ID, 1)
		assertConversationLength(t, baseURL, token2, user1ID, 1)

		t.Log("alice → bob: 'Hey Bob, how are you?' DELIVERED (real-time + persisted)")
	})

	
	t.Run("Phase5_BobReplies", func(t *testing.T) {
		sendPrivateMsg(t, wsBob, user1ID, "I'm good Alice! What's up?")
		time.Sleep(200 * time.Millisecond)

		
		echo := readWSMessage(t, wsBob, 2*time.Second)
		verifyIncomingMsg(t, echo, user2ID, "I'm good Alice! What's up?")
		t.Log("  [drained sender echo on bob]")

		
		msg := readWSMessage(t, wsAlice, 2*time.Second)
		verifyIncomingMsg(t, msg, user2ID, "I'm good Alice! What's up?")

		assertConversationLength(t, baseURL, token1, user2ID, 2)
		assertConversationLength(t, baseURL, token2, user1ID, 2)

		t.Log("bob → alice: 'I'm good Alice! What's up?' DELIVERED (real-time + persisted)")
	})

	
	t.Run("Phase6_MultiMessageExchange", func(t *testing.T) {
		conversation := []struct {
			sender    *websocket.Conn
			recipient *websocket.Conn
			recipID   string
			senderID  string
			text      string
		}{
			{wsAlice, wsBob, user2ID, user1ID, "Just working on that forum project"},
			{wsBob, wsAlice, user1ID, user2ID, "Oh nice, the real-time chat feature?"},
			{wsAlice, wsBob, user2ID, user1ID, "Yeah exactly! Testing the WebSocket now"},
			{wsBob, wsAlice, user1ID, user2ID, "Seems to be working great so far"},
			{wsAlice, wsBob, user2ID, user1ID, "Agreed! The real-time delivery is solid"},
			{wsBob, wsAlice, user1ID, user2ID, "Let me know if you need any help with it"},
			{wsAlice, wsBob, user2ID, user1ID, "Will do, thanks Bob!"},
		}

		expectedTotal := 2 + len(conversation) 

		for i, turn := range conversation {
			sendPrivateMsg(t, turn.sender, turn.recipID, turn.text)
			time.Sleep(150 * time.Millisecond)

			
			echo := readWSMessage(t, turn.sender, 2*time.Second)
			verifyIncomingMsg(t, echo, turn.senderID, turn.text)

			
			msg := readWSMessage(t, turn.recipient, 2*time.Second)
			verifyIncomingMsg(t, msg, "", turn.text)
			t.Logf("  [%d] DELIVERED: %q", i+3, turn.text)
		}

		assertConversationLength(t, baseURL, token1, user2ID, expectedTotal)
		assertConversationLength(t, baseURL, token2, user1ID, expectedTotal)

		t.Logf("multi-message exchange complete: %d total messages", expectedTotal)
	})

	
	t.Run("Phase7_ConversationIntegrity", func(t *testing.T) {
		expectedTexts := []string{
			"Hey Bob, how are you?",
			"I'm good Alice! What's up?",
			"Just working on that forum project",
			"Oh nice, the real-time chat feature?",
			"Yeah exactly! Testing the WebSocket now",
			"Seems to be working great so far",
			"Agreed! The real-time delivery is solid",
			"Let me know if you need any help with it",
			"Will do, thanks Bob!",
		}

		
		assertContainsAll := func(msgs []messageDTO) {
			seen := make(map[string]bool)
			for _, m := range msgs {
				seen[m.TextMessage] = true
				
				if m.SenderId != user1ID && m.SenderId != user2ID {
					t.Fatalf("unexpected senderId: %s", m.SenderId)
				}
				if m.RecipientId != user1ID && m.RecipientId != user2ID {
					t.Fatalf("unexpected recipientId: %s", m.RecipientId)
				}
				if m.SenderId == m.RecipientId {
					t.Fatalf("sender cannot be recipient: %s", m.SenderId)
				}
			}
			for _, expected := range expectedTexts {
				if !seen[expected] {
					t.Fatalf("missing message: %q", expected)
				}
			}
		}

		
		aliceMsgs := getMessages(t, baseURL, token1, user2ID, 0, 50)
		if len(aliceMsgs.Data.Messages) != len(expectedTexts) {
			t.Fatalf("alice sees %d messages, expected %d", len(aliceMsgs.Data.Messages), len(expectedTexts))
		}
		assertContainsAll(aliceMsgs.Data.Messages)

		
		bobMsgs := getMessages(t, baseURL, token2, user1ID, 0, 50)
		if len(bobMsgs.Data.Messages) != len(expectedTexts) {
			t.Fatalf("bob sees %d messages, expected %d", len(bobMsgs.Data.Messages), len(expectedTexts))
		}
		assertContainsAll(bobMsgs.Data.Messages)

		
		aliceSentCount := 0
		bobSentCount := 0
		for _, m := range aliceMsgs.Data.Messages {
			if m.SenderId == user1ID && m.RecipientId == user2ID {
				aliceSentCount++
			} else if m.SenderId == user2ID && m.RecipientId == user1ID {
				bobSentCount++
			}
		}
		if aliceSentCount != 5 {
			t.Fatalf("alice sent 5 messages, counted %d", aliceSentCount)
		}
		if bobSentCount != 4 {
			t.Fatalf("bob sent 4 messages, counted %d", bobSentCount)
		}

		t.Logf("conversation integrity verified: 9 messages (%d alice, %d bob), all present in both perspectives", aliceSentCount, bobSentCount)
	})

	t.Log("=== Chat Simulation Dry Run: ALL PHASES PASSED ===")
}

func TestWebSocketTypingIndicator(t *testing.T) {
	
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

	_, err = database.Exec(testSchema)
	if err != nil {
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
		case "/api/v1/auth/login":
			handlers.HandlerCtx.Login(w, r)
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

	
	user1ID, token1 := registerTestUser(t, baseURL, "typer", "typer@test.com", "TyperPass123!@#")
	user2ID, token2 := registerTestUser(t, baseURL, "watcher", "watcher@test.com", "WatcherPass123!@#")

	ws1 := dialWebSocket(t, wsURL, token1)
	defer ws1.Close()

	ws2 := dialWebSocket(t, wsURL, token2)
	defer ws2.Close()

	time.Sleep(200 * time.Millisecond)

	
	t.Run("TypingRelayedWithNickname", func(t *testing.T) {
		sendTypingEvent(t, ws1, pkgwebsocket.MsgTypeTyping, user1ID, user2ID)

		msg := readWSMessageOfType(t, ws2, pkgwebsocket.MsgTypeTyping, 2*time.Second)

		var payload pkgwebsocket.TypingPayload
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			t.Fatalf("failed to unmarshal typing payload: %v", err)
		}

		if payload.SenderId != user1ID {
			t.Fatalf("expected senderId=%s, got %s", user1ID, payload.SenderId)
		}
		if payload.RecipientId != user2ID {
			t.Fatalf("expected recipientId=%s, got %s", user2ID, payload.RecipientId)
		}
		if payload.SenderNickname != "typer" {
			t.Fatalf("expected senderNickname='typer', got %q", payload.SenderNickname)
		}
		t.Logf("typing event relayed to recipient with sender nickname %q", payload.SenderNickname)
	})

	
	t.Run("TypingStoppedRelayed", func(t *testing.T) {
		sendTypingEvent(t, ws1, pkgwebsocket.MsgTypeTypingStopped, user1ID, user2ID)

		msg := readWSMessageOfType(t, ws2, pkgwebsocket.MsgTypeTypingStopped, 2*time.Second)

		var payload pkgwebsocket.TypingPayload
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			t.Fatalf("failed to unmarshal typing_stopped payload: %v", err)
		}

		if payload.SenderId != user1ID {
			t.Fatalf("expected senderId=%s, got %s", user1ID, payload.SenderId)
		}
		if payload.RecipientId != user2ID {
			t.Fatalf("expected recipientId=%s, got %s", user2ID, payload.RecipientId)
		}
		t.Log("typing_stopped event relayed to recipient")
	})

	
	t.Run("SpoofedTypingDropped", func(t *testing.T) {
		
		sendTypingEvent(t, ws1, pkgwebsocket.MsgTypeTyping, user2ID, user2ID)
		time.Sleep(150 * time.Millisecond)

		
		sendTypingEvent(t, ws1, pkgwebsocket.MsgTypeTyping, user1ID, user2ID)

		msg := readWSMessageOfType(t, ws2, pkgwebsocket.MsgTypeTyping, 2*time.Second)

		var payload pkgwebsocket.TypingPayload
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			t.Fatalf("failed to unmarshal typing payload: %v", err)
		}

		if payload.SenderId != user1ID {
			t.Fatalf("spoofed typing event was relayed (senderId=%s)", payload.SenderId)
		}
		t.Log("spoofed typing event (senderId mismatch) correctly dropped")
	})

	t.Log("=== Typing Indicator: ALL PHASES PASSED ===")
}

func sendTypingEvent(t *testing.T, conn *websocket.Conn, eventType, senderID, recipientID string) {
	t.Helper()
	msg := map[string]interface{}{
		"type": eventType,
		"payload": map[string]string{
			"senderId":    senderID,
			"recipientId": recipientID,
		},
	}
	data, _ := json.Marshal(msg)
	if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatalf("write error: %v", err)
	}
}

func readWSMessageOfType(t *testing.T, conn *websocket.Conn, msgType string, timeout time.Duration) rawWSMessage {
	t.Helper()

	deadline := time.Now().Add(timeout)
	conn.SetReadDeadline(deadline)

	for time.Now().Before(deadline) {
		var msg rawWSMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			t.Fatalf("read error while waiting for %s: %v", msgType, err)
		}

		if msg.Type == msgType {
			return msg
		}

		
		t.Logf("  [drained %s]", msg.Type)
	}

	t.Fatalf("timed out waiting for %s", msgType)
	return rawWSMessage{}
}

func sendPrivateMsg(t *testing.T, conn *websocket.Conn, recipientID, text string) {
	t.Helper()
	msg := map[string]interface{}{
		"type": "private_msg",
		"payload": map[string]string{
			"recipientId": recipientID,
			"text":        text,
		},
	}
	data, _ := json.Marshal(msg)
	if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatalf("write error: %v", err)
	}
}

type rawWSMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

func readWSMessage(t *testing.T, conn *websocket.Conn, timeout time.Duration) rawWSMessage {
	t.Helper()

	deadline := time.Now().Add(timeout)
	conn.SetReadDeadline(deadline)

	for time.Now().Before(deadline) {
		var msg rawWSMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			t.Fatalf("read error: %v", err)
		}

		if msg.Type == pkgwebsocket.MsgTypeIncomingMsg {
			return msg
		}

		
		t.Logf("  [drained %s]", msg.Type)
	}

	t.Fatalf("timed out waiting for incoming_msg")
	return rawWSMessage{}
}

func verifyIncomingMsg(t *testing.T, msg rawWSMessage, expectedSenderID, expectedText string) {
	t.Helper()

	var payload pkgwebsocket.IncomingMsgPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		t.Fatalf("failed to unmarshal incoming_msg payload: %v", err)
	}

	if expectedSenderID != "" && payload.SenderId != expectedSenderID {
		t.Fatalf("expected senderId=%s, got %s", expectedSenderID, payload.SenderId)
	}
	if payload.Text != expectedText {
		t.Fatalf("expected text=%q, got %q", expectedText, payload.Text)
	}
}

func assertConversationLength(t *testing.T, baseURL, token, partnerID string, expected int) {
	t.Helper()
	resp := getMessages(t, baseURL, token, partnerID, 0, 50)
	if len(resp.Data.Messages) != expected {
		t.Fatalf("expected %d messages in conversation, got %d", expected, len(resp.Data.Messages))
	}
}

type messagesResponse struct {
	Data struct {
		Messages      []messageDTO `json:"messages"`
		Offset        int          `json:"offset"`
		Limit         int          `json:"limit"`
		TotalElements int          `json:"totalElements"`
	} `json:"data"`
}

type messageDTO struct {
	MessageId   int    `json:"messageId"`
	SenderId    string `json:"senderId"`
	RecipientId string `json:"recipientId"`
	TextMessage string `json:"textMessage"`
	TimeStamp   string `json:"timeStamp"`
	IsRead      int    `json:"isRead"`
}

func getMessages(t *testing.T, baseURL, token, partnerID string, offset, limit int) messagesResponse {
	t.Helper()
	url := fmt.Sprintf("%s/api/v1/messages?partnerId=%s&offset=%d&limit=%d", baseURL, partnerID, offset, limit)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}
	req.Header.Set("Cookie", "session_token="+token)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("get messages request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body := new(bytes.Buffer)
		body.ReadFrom(resp.Body)
		t.Fatalf("get messages expected 200, got %d: %s", resp.StatusCode, body.String())
	}

	var result messagesResponse
	json.NewDecoder(resp.Body).Decode(&result)
	return result
}

func registerTestUser(t *testing.T, baseURL, nickname, email, password string) (string, string) {
	t.Helper()

	form := fmt.Sprintf("nickName=%s&email=%s&firstName=Test&lastName=User&password=%s&confirmPassword=%s&age=25&gender=male",
		nickname, email, password, password)

	resp, err := http.Post(baseURL+"/api/v1/auth/register", "application/x-www-form-urlencoded", bytes.NewBufferString(form))
	if err != nil {
		t.Fatalf("register request failed: %v", err)
	}

	if resp.StatusCode != http.StatusCreated {
		body := new(bytes.Buffer)
		body.ReadFrom(resp.Body)
		resp.Body.Close()
		t.Fatalf("register expected 201, got %d: %s", resp.StatusCode, body.String())
	}

	var token string
	for _, c := range resp.Cookies() {
		if c.Name == "session_token" {
			token = c.Value
			break
		}
	}
	if token == "" {
		resp.Body.Close()
		t.Fatal("no session_token cookie in register response")
	}

	var registerResp struct {
		Data struct {
			UserID string `json:"userId"`
		} `json:"data"`
	}
	json.NewDecoder(resp.Body).Decode(&registerResp)
	resp.Body.Close()

	return registerResp.Data.UserID, token
}

func dialWebSocket(t *testing.T, wsURL, token string) *websocket.Conn {
	t.Helper()

	header := http.Header{}
	header.Add("Cookie", "session_token="+token)

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("websocket dial error: %v", err)
	}
	return conn
}