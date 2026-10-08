package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"social-network/backend/pkg/app/repositories"
)

const (
	seededPassword  = "DummyUser123!"
	rotatedPassword = "RotatedPassword123!"
)

func callRaw(t *testing.T, client integrationClient, method, path string, body any, status int) errorEnvelope {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest(method, client.base+path, bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := client.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	data, _ := io.ReadAll(response.Body)
	if response.StatusCode != status {
		t.Fatalf("%s %s: expected %d, got %d: %s", method, path, status, response.StatusCode, data)
	}
	var envelope errorEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		t.Fatalf("%s %s: response is not JSON: %s", method, path, data)
	}
	return envelope
}

func clientWithToken(t *testing.T, server *httptest.Server, token string) integrationClient {
	t.Helper()
	client := newIntegrationClient(t, server)
	parsed, _ := url.Parse(server.URL)
	client.client.Jar.SetCookies(parsed, []*http.Cookie{{Name: "session_token", Value: token, Path: "/"}})
	return client
}

func sessionRowCount(t *testing.T, repo *repositories.DB, userID string) int {
	t.Helper()
	var count int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM session WHERE userId = ?", userID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func storedPasswordHash(t *testing.T, repo *repositories.DB, userID string) string {
	t.Helper()
	var hash string
	if err := repo.Conn.QueryRow("SELECT password FROM user WHERE userId = ?", userID).Scan(&hash); err != nil {
		t.Fatal(err)
	}
	return hash
}

func TestPasswordChangeRotatesTheSession(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)
	serverURL, _ := url.Parse(server.URL)
	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")

	const stolenToken = "stolen-session-token"
	now := time.Now().UTC()
	const layout = "2006-01-02 15:04:05"
	if _, err := repo.Conn.Exec(
		"INSERT INTO session (token, userId, expiresAt, createdAt, lastSeenAt) VALUES (?,?,?,?,?)",
		stolenToken, "dummy-id", now.Add(time.Hour).Format(layout), now.Format(layout), now.Format(layout),
	); err != nil {
		t.Fatal(err)
	}
	clientWithToken(t, server, stolenToken).call("GET", "/api/v1/users/me", nil, 200)

	beforeToken := sessionCookie(t, client, serverURL)
	beforeHash := storedPasswordHash(t, repo, "dummy-id")

	for name, body := range map[string]map[string]string{
		"matching but too short": {"currentPassword": seededPassword, "newPassword": "Short1!", "confirmPassword": "Short1!"},
		"confirmation differs":   {"currentPassword": seededPassword, "newPassword": rotatedPassword, "confirmPassword": rotatedPassword + "x"},
		"no symbol":              {"currentPassword": seededPassword, "newPassword": "onlyletters1234", "confirmPassword": "onlyletters1234"},
		"no current password":    {"currentPassword": "", "newPassword": rotatedPassword, "confirmPassword": rotatedPassword},
	} {
		t.Run(name, func(t *testing.T) {
			client.call("PUT", "/api/v1/users/me/password", body, 400)
		})
	}
	if hash := storedPasswordHash(t, repo, "dummy-id"); hash != beforeHash {
		t.Fatal("a rejected request changed the stored password")
	}

	wrong := callRaw(t, client, "PUT", "/api/v1/users/me/password", map[string]string{
		"currentPassword": "NotMyPassword123!", "newPassword": rotatedPassword, "confirmPassword": rotatedPassword,
	}, http.StatusBadRequest)
	if wrong.Success || wrong.Code != http.StatusBadRequest || wrong.Error != "your current password is incorrect" {
		t.Fatalf("unexpected refusal: %+v", wrong)
	}
	if token := sessionCookie(t, client, serverURL); token != beforeToken {
		t.Fatal("a refused change rotated the session anyway")
	}

	changed := decoded[map[string]string](t, client.call("PUT", "/api/v1/users/me/password", map[string]string{
		"currentPassword": seededPassword, "newPassword": rotatedPassword, "confirmPassword": rotatedPassword,
	}, 200))
	if changed["message"] == "" {
		t.Fatalf("unexpected body: %+v", changed)
	}
	if token := sessionCookie(t, client, serverURL); token == beforeToken || token == "" {
		t.Fatal("the response did not rotate the session cookie")
	}

	client.call("GET", "/api/v1/users/me", nil, 200)
	if count := sessionRowCount(t, repo, "dummy-id"); count != 1 {
		t.Fatalf("expected only the rotated session row to remain, found %d", count)
	}
	clientWithToken(t, server, beforeToken).call("GET", "/api/v1/users/me", nil, 401)
	clientWithToken(t, server, stolenToken).call("GET", "/api/v1/users/me", nil, 401)

	signIn := func(password string, status int) {
		t.Helper()
		newIntegrationClient(t, server).call("POST", "/api/v1/auth/login", url.Values{
			"identifier": {"dummy@example.com"}, "password": {password},
		}, status)
	}
	signIn(seededPassword, 400)
	signIn(rotatedPassword, 200)
	if hash := storedPasswordHash(t, repo, "dummy-id"); hash == beforeHash || !strings.HasPrefix(hash, "$2") {
		t.Fatalf("the stored credential is not a fresh bcrypt hash: %q", hash)
	}

	newIntegrationClient(t, server).call("PUT", "/api/v1/users/me/password", map[string]string{
		"currentPassword": seededPassword, "newPassword": rotatedPassword, "confirmPassword": rotatedPassword,
	}, 401)
	client.call("POST", "/api/v1/users/me/password", nil, 404)
}
