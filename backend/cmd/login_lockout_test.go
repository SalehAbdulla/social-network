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

func TestLoginLockoutFollowsTheAccount(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	handlers.HandlerCtx.LoginLimiter = middleware.NewAttemptLimiter(3, 400*time.Millisecond)

	guest := newIntegrationClient(t, server)
	wrong := func(client integrationClient, identifier string, status int) {
		t.Helper()
		client.call("POST", "/api/v1/auth/login", url.Values{"identifier": {identifier}, "password": {"definitely not the password"}}, status)
	}

	wrong(guest, "dummy@example.com", 400)
	wrong(guest, "dummy@example.com", 400)
	wrong(guest, "dummy@example.com", 400)

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

	newIntegrationClient(t, server).login("alex@example.com")

	unknown := newIntegrationClient(t, server)
	for i := 0; i < 3; i++ {
		wrong(unknown, "nobody@example.com", 400)
	}
	wrong(unknown, "nobody@example.com", 429)

	time.Sleep(500 * time.Millisecond)
	if response := doLogin(t, guest, "dummy@example.com", "DummyUser123!"); response.StatusCode != http.StatusOK {
		t.Fatalf("the account stayed locked after its window: %d", response.StatusCode)
	}

	wrong(guest, "dummy@example.com", 400)
	wrong(guest, "dummy@example.com", 400)
	guest.login("dummy@example.com")
	wrong(guest, "dummy@example.com", 400)
	wrong(guest, "dummy@example.com", 400)
	wrong(guest, "dummy@example.com", 400)
	wrong(guest, "dummy@example.com", 429)
}
