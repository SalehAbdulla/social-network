package main

import (
	"testing"

	"social-network/backend/pkg/models"
)

// accountsPayload mirrors the switcher's answer so a test can decode it without
// importing the handler package's unexported type.
type accountsPayload struct {
	Accounts     []models.SavedAccount `json:"accounts"`
	ActiveUserID string                `json:"activeUserId"`
}

// TestSavedAccountsSwitchWithoutPassword is the feature end to end on one browser:
// two accounts sign in, the switcher lists both with the newest active, and a
// switch moves the session to the other account with no password.
func TestSavedAccountsSwitchWithoutPassword(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)

	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")
	client.login("alex@example.com")

	listed := decoded[accountsPayload](t, client.call("GET", "/api/v1/auth/accounts", nil, 200))
	if len(listed.Accounts) != 2 {
		t.Fatalf("expected two saved accounts, got %+v", listed)
	}
	if listed.ActiveUserID != "alex-id" {
		t.Fatalf("active account = %q, want the newest login, alex-id", listed.ActiveUserID)
	}
	if listed.Accounts[0].UserID != "alex-id" || listed.Accounts[1].UserID != "dummy-id" {
		t.Fatalf("the newest login should lead the list: %+v", listed.Accounts)
	}
	if listed.Accounts[1].Nickname != "dummyuser" {
		t.Fatalf("an account row is missing its display data: %+v", listed.Accounts[1])
	}

	// Switching is passwordless and takes effect on the next request.
	client.call("POST", "/api/v1/auth/switch", map[string]string{"userId": "dummy-id"}, 200)
	if me := decoded[models.SocialUser](t, client.call("GET", "/api/v1/users/me", nil, 200)); me.UserID != "dummy-id" {
		t.Fatalf("after switching, the session belongs to %q, want dummy-id", me.UserID)
	}

	// The switch reorders the list so the now-active account leads it.
	switched := decoded[accountsPayload](t, client.call("GET", "/api/v1/auth/accounts", nil, 200))
	if switched.ActiveUserID != "dummy-id" || switched.Accounts[0].UserID != "dummy-id" {
		t.Fatalf("the switcher did not follow the switch: %+v", switched)
	}

	// An account this browser never saved cannot be switched to.
	client.call("POST", "/api/v1/auth/switch", map[string]string{"userId": "carol-id"}, 404)
	// Nor can an empty one.
	client.call("POST", "/api/v1/auth/switch", map[string]string{"userId": ""}, 400)
}

// TestRemovingTheActiveSavedAccountHandsOverTheSession covers the "x" in the
// switcher: forgetting the account you are signed in as signs that account out and
// hands the session to the one that remains.
func TestRemovingTheActiveSavedAccountHandsOverTheSession(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)

	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")
	client.login("alex@example.com")

	// The active account is alex (the newest login); forget it.
	after := decoded[accountsPayload](t, client.call("POST", "/api/v1/auth/accounts/remove", map[string]string{"userId": "alex-id"}, 200))
	if after.ActiveUserID != "dummy-id" {
		t.Fatalf("removing the active account should hand over to dummy-id, got %q", after.ActiveUserID)
	}
	if len(after.Accounts) != 1 || after.Accounts[0].UserID != "dummy-id" {
		t.Fatalf("the removed account is still listed: %+v", after.Accounts)
	}

	// The forgotten account's session is revoked, not merely hidden.
	var alexSessions int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM session WHERE userId = 'alex-id'").Scan(&alexSessions); err != nil || alexSessions != 0 {
		t.Fatalf("the removed account's session lingered: %d (err=%v)", alexSessions, err)
	}

	// The surviving account is signed in and usable.
	if me := decoded[models.SocialUser](t, client.call("GET", "/api/v1/users/me", nil, 200)); me.UserID != "dummy-id" {
		t.Fatalf("the surviving session belongs to %q", me.UserID)
	}
}

// TestLogoutSignsOutEverySavedAccount is the "log out of all accounts" contract:
// the top-level log out clears the list and revokes every saved session, not only
// the active one.
func TestLogoutSignsOutEverySavedAccount(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)

	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")
	client.login("alex@example.com")

	client.call("POST", "/api/v1/auth/logout", nil, 200)

	var remaining int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM session").Scan(&remaining); err != nil || remaining != 0 {
		t.Fatalf("logout left %d sessions behind (err=%v)", remaining, err)
	}
	client.call("GET", "/api/v1/users/me", nil, 401)
	client.call("GET", "/api/v1/auth/accounts", nil, 401)
}
