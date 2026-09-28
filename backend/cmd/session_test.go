package main

import (
	"net/http"
	"net/url"
	"testing"
	"time"

	"social-network/backend/pkg/app/service"
)

// isolatedSessionManager swaps in a manager with a cold cache before the server
// is built, so the services capture it. Combined with UseStore on the same
// database it stands in for a backend restart.
func isolatedSessionManager(t *testing.T) *service.SessionManager {
	t.Helper()
	original := service.DefaultSessionManager
	manager := service.NewSessionManager()
	service.DefaultSessionManager = manager
	t.Cleanup(func() {
		service.DefaultSessionManager.UseStore(nil)
		service.DefaultSessionManager = original
	})
	return manager
}

func sessionCookie(t *testing.T, client integrationClient, serverURL *url.URL) string {
	t.Helper()
	for _, cookie := range client.client.Jar.Cookies(serverURL) {
		if cookie.Name == "session_token" {
			return cookie.Value
		}
	}
	t.Fatal("login did not set a session cookie")
	return ""
}

func TestSessionsSurviveBackendRestart(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)

	serverURL, _ := url.Parse(server.URL)
	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")
	token := sessionCookie(t, client, serverURL)

	var stored int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM session WHERE token = ?", token).Scan(&stored); err != nil || stored != 1 {
		t.Fatalf("login did not persist the session row: count=%d err=%v", stored, err)
	}

	// Restart: a new process with an empty cache over the same database.
	service.DefaultSessionManager = service.NewSessionManager()
	service.DefaultSessionManager.UseStore(repo)
	if len(service.DefaultSessionManager.TokenToUID) != 0 {
		t.Fatal("the restarted manager kept the previous cache")
	}

	client.call("GET", "/api/v1/auth/me", nil, 200)
	if userID, ok := service.DefaultSessionManager.GetUserIdByToken(token); !ok || userID != "dummy-id" {
		t.Fatalf("the stored session was not usable after the restart: %q %v", userID, ok)
	}
}

func TestExpiredSessionRowIsRejectedAndRemoved(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)

	serverURL, _ := url.Parse(server.URL)
	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")
	token := sessionCookie(t, client, serverURL)

	if _, err := repo.Conn.Exec("UPDATE session SET expiresAt = datetime('now', '-1 hour') WHERE token = ?", token); err != nil {
		t.Fatal(err)
	}
	// A cold cache forces the lookup through the database.
	service.DefaultSessionManager = service.NewSessionManager()
	service.DefaultSessionManager.UseStore(repo)

	client.call("GET", "/api/v1/auth/me", nil, 401)
	var remaining int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM session WHERE token = ?", token).Scan(&remaining); err != nil {
		t.Fatal(err)
	}
	if remaining != 0 {
		t.Fatal("an expired session row was left behind")
	}
}

func TestLoginRevokesThePreviousSessionRow(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)

	serverURL, _ := url.Parse(server.URL)
	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")
	firstToken := sessionCookie(t, client, serverURL)
	client.login("dummy@example.com")
	secondToken := sessionCookie(t, client, serverURL)

	if firstToken == secondToken {
		t.Fatal("the second login reused the previous token")
	}
	var count int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM session WHERE userId = 'dummy-id'").Scan(&count); err != nil || count != 1 {
		t.Fatalf("expected exactly one stored session, got %d (err=%v)", count, err)
	}
	var stored string
	if err := repo.Conn.QueryRow("SELECT token FROM session WHERE userId = 'dummy-id'").Scan(&stored); err != nil || stored != secondToken {
		t.Fatalf("the stored session is %q, want the newest token (err=%v)", stored, err)
	}

	stale := newIntegrationClient(t, server)
	stale.client.Jar.SetCookies(serverURL, []*http.Cookie{{Name: "session_token", Value: firstToken, Path: "/"}})
	stale.call("GET", "/api/v1/auth/me", nil, 401)
}

func TestLogoutDeletesTheSessionRow(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)

	serverURL, _ := url.Parse(server.URL)
	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")
	token := sessionCookie(t, client, serverURL)

	client.call("POST", "/api/v1/auth/logout", nil, 200)
	var count int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM session WHERE token = ?", token).Scan(&count); err != nil || count != 0 {
		t.Fatalf("logout left the session row behind: count=%d err=%v", count, err)
	}
	client.call("GET", "/api/v1/auth/me", nil, 401)
}

func TestSessionCleanupRemovesStaleRows(t *testing.T) {
	manager := isolatedSessionManager(t)
	_, repo := integrationServer(t, true, false)
	manager.UseStore(repo)

	now := time.Now().UTC()
	stamp := func(offset time.Duration) string { return now.Add(offset).Format("2006-01-02 15:04:05") }
	insert := func(token, expiresAt, createdAt, lastSeenAt string) {
		t.Helper()
		if _, err := repo.Conn.Exec(
			"INSERT INTO session (token, userId, expiresAt, createdAt, lastSeenAt) VALUES (?, 'dummy-id', ?, ?, ?)",
			token, expiresAt, createdAt, lastSeenAt,
		); err != nil {
			t.Fatal(err)
		}
	}
	insert("live-token", stamp(24*time.Hour), stamp(-time.Hour), stamp(-time.Minute))
	insert("expired-token", stamp(-time.Hour), stamp(-48*time.Hour), stamp(-time.Hour))
	insert("idle-token", stamp(24*time.Hour), stamp(-24*time.Hour), stamp(-20*24*time.Hour))
	insert("capped-token", stamp(24*time.Hour), stamp(-40*24*time.Hour), stamp(-time.Minute))

	removed, err := manager.CleanupExpired()
	if err != nil {
		t.Fatal(err)
	}
	if removed != 3 {
		t.Fatalf("cleanup removed %d rows, want 3", removed)
	}
	rows, err := repo.Conn.Query("SELECT token FROM session")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	remaining := []string{}
	for rows.Next() {
		var token string
		if err := rows.Scan(&token); err != nil {
			t.Fatal(err)
		}
		remaining = append(remaining, token)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(remaining) != 1 || remaining[0] != "live-token" {
		t.Fatalf("cleanup kept the wrong rows: %v", remaining)
	}
}
