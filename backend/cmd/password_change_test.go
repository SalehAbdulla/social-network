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

// The credential the seeded account signs in with, and the replacement this test
// rotates to. Both satisfy the shared rules: twelve characters or more with a
// letter, a number and a symbol.
const (
	seededPassword  = "DummyUser123!"
	rotatedPassword = "RotatedPassword123!"
)

// callRaw performs a request and returns the error envelope, because the shared
// call helper returns only the data member and the message is the assertion here.
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

// clientWithToken is a browser presenting one token directly, which is how a
// revoked cookie has to be tested: the login flow would never leave two live
// sessions for one account open at once.
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

// TestPasswordChangeRotatesTheSession covers the credential path end to end: the
// password is replaced, the browser that changed it keeps working on the
// replacement cookie, and every other session of that account stops working.
func TestPasswordChangeRotatesTheSession(t *testing.T) {
	// The store-backed manager is what makes the rotation observable here: the
	// replacement token revokes the account's other session rows, and a token is
	// only recognisable after that if the manager can read the table.
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)
	serverURL, _ := url.Parse(server.URL)
	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")

	// A second, already-issued session for the same account. The login flow
	// cannot produce this — signing in revokes the previous token — so it is
	// written straight to the table: this is the stolen-cookie case, and the
	// rotation is what has to end it.
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

	// A weak or mismatched payload is refused before the credential is compared,
	// so a rejected request never touches the stored hash. The confirmation is
	// enforced server-side rather than trusted to the dialog.
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

	// A wrong current password is answered in its own words rather than with the
	// generic sign-in error, and nothing rotates.
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

	// The browser that changed the password is still signed in on the new cookie,
	// while the token it used before and the stolen one are both dead — in the
	// table and over HTTP.
	client.call("GET", "/api/v1/users/me", nil, 200)
	if count := sessionRowCount(t, repo, "dummy-id"); count != 1 {
		t.Fatalf("expected only the rotated session row to remain, found %d", count)
	}
	clientWithToken(t, server, beforeToken).call("GET", "/api/v1/users/me", nil, 401)
	clientWithToken(t, server, stolenToken).call("GET", "/api/v1/users/me", nil, 401)

	// The credential itself changed: the old password no longer signs in, and the
	// new one does.
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

	// Without a session the request never reaches the handler, and the route is a
	// PUT: any other method gets the same JSON 404 as an unknown path.
	newIntegrationClient(t, server).call("PUT", "/api/v1/users/me/password", map[string]string{
		"currentPassword": seededPassword, "newPassword": rotatedPassword, "confirmPassword": rotatedPassword,
	}, 401)
	client.call("POST", "/api/v1/users/me/password", nil, 404)
}
