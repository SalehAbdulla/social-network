package tests

import (
	"testing"

	"social-network/backend/pkg/models"
)

type accountsPayload struct {
	Accounts     []models.SavedAccount `json:"accounts"`
	ActiveUserID string                `json:"activeUserId"`
}

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

	client.call("POST", "/api/v1/auth/switch", map[string]string{"userId": "dummy-id"}, 200)
	if me := decoded[models.SocialUser](t, client.call("GET", "/api/v1/users/me", nil, 200)); me.UserID != "dummy-id" {
		t.Fatalf("after switching, the session belongs to %q, want dummy-id", me.UserID)
	}

	switched := decoded[accountsPayload](t, client.call("GET", "/api/v1/auth/accounts", nil, 200))
	if switched.ActiveUserID != "dummy-id" || switched.Accounts[0].UserID != "dummy-id" {
		t.Fatalf("the switcher did not follow the switch: %+v", switched)
	}

	client.call("POST", "/api/v1/auth/switch", map[string]string{"userId": "carol-id"}, 404)
	client.call("POST", "/api/v1/auth/switch", map[string]string{"userId": ""}, 400)
}

func TestRemovingTheActiveSavedAccountHandsOverTheSession(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)

	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")
	client.login("alex@example.com")

	after := decoded[accountsPayload](t, client.call("POST", "/api/v1/auth/accounts/remove", map[string]string{"userId": "alex-id"}, 200))
	if after.ActiveUserID != "dummy-id" {
		t.Fatalf("removing the active account should hand over to dummy-id, got %q", after.ActiveUserID)
	}
	if len(after.Accounts) != 1 || after.Accounts[0].UserID != "dummy-id" {
		t.Fatalf("the removed account is still listed: %+v", after.Accounts)
	}

	var alexSessions int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM session WHERE userId = 'alex-id'").Scan(&alexSessions); err != nil || alexSessions != 0 {
		t.Fatalf("the removed account's session lingered: %d (err=%v)", alexSessions, err)
	}

	if me := decoded[models.SocialUser](t, client.call("GET", "/api/v1/users/me", nil, 200)); me.UserID != "dummy-id" {
		t.Fatalf("the surviving session belongs to %q", me.UserID)
	}
}

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
