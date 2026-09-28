package main

import (
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"social-network/backend/pkg/app/handlers"
	"social-network/backend/pkg/middleware"
)

// doLogin sends a real sign-in and hands back the response, so the test can read
// the status and the Retry-After header instead of asserting a status up front.
func doLogin(t *testing.T, client integrationClient, identifier, password string) *http.Response {
	t.Helper()
	request, err := http.NewRequest("POST", client.base+"/api/v1/auth/login", strings.NewReader(url.Values{
		"identifier": {identifier}, "password": {password},
	}.Encode()))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := client.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.Copy(io.Discard, response.Body)
	response.Body.Close()
	return response
}

// TestLoginLockoutFollowsTheAccount is the reason the limit cannot only be per
// peer: behind the frontend proxy every request arrives from the same address, so
// the lock has to follow the account being guessed at and leave everyone else
// alone. Wrong credentials answer 400 in this API (`ErrInvalidCredentials`), so
// that is what the attempts below expect until the account is locked.
func TestLoginLockoutFollowsTheAccount(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	// A short window proves expiry without sleeping for the production fifteen
	// minutes; the limit stays small for the same reason.
	handlers.HandlerCtx.LoginLimiter = middleware.NewAttemptLimiter(3, 400*time.Millisecond)

	guest := newIntegrationClient(t, server)
	wrong := func(client integrationClient, identifier string, status int) {
		t.Helper()
		client.call("POST", "/api/v1/auth/login", url.Values{"identifier": {identifier}, "password": {"definitely not the password"}}, status)
	}

	// Three failures are still answered like any other bad password.
	wrong(guest, "dummy@example.com", 400)
	wrong(guest, "dummy@example.com", 400)
	wrong(guest, "dummy@example.com", 400)

	// The fourth attempt is refused before the password is looked at, and says how
	// long to wait. Even the right password has to wait it out.
	response := doLogin(t, guest, "dummy@example.com", "DummyUser123!")
	if response.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("a locked account got %d, want 429", response.StatusCode)
	}
	retry := response.Header.Get("Retry-After")
	if retry == "" {
		t.Fatal("the lockout came without a Retry-After header")
	}
	if seconds, err := strconv.Atoi(retry); err != nil || seconds < 1 {
		t.Fatalf("Retry-After = %q", retry)
	}
	if response := doLogin(t, guest, "dummy@example.com", "DummyUser123!"); response.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("the correct password bypassed the lock: %d", response.StatusCode)
	}

	// Somebody else's account is untouched by the lock.
	newIntegrationClient(t, server).login("alex@example.com")

	// An identifier nobody owns locks the same way, so the lock cannot be used to
	// probe which addresses are registered.
	unknown := newIntegrationClient(t, server)
	for i := 0; i < 3; i++ {
		wrong(unknown, "nobody@example.com", 400)
	}
	wrong(unknown, "nobody@example.com", 429)

	// Once the window passes the account is free.
	time.Sleep(500 * time.Millisecond)
	if response := doLogin(t, guest, "dummy@example.com", "DummyUser123!"); response.StatusCode != http.StatusOK {
		t.Fatalf("the account stayed locked after its window: %d", response.StatusCode)
	}

	// A successful sign-in forgets the failures that came before it, so the lock
	// arrives after three more and not after one.
	wrong(guest, "dummy@example.com", 400)
	wrong(guest, "dummy@example.com", 400)
	guest.login("dummy@example.com")
	wrong(guest, "dummy@example.com", 400)
	wrong(guest, "dummy@example.com", 400)
	wrong(guest, "dummy@example.com", 400)
	wrong(guest, "dummy@example.com", 429)
}
