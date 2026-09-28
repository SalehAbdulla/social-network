package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/message"
)

func privateMessage(t *testing.T, client integrationClient, recipient, text string, status int) {
	t.Helper()
	client.call("POST", "/api/v1/messages", map[string]any{"recipientId": recipient, "text": text}, status)
}

// TestPrivateMessageSocketRespectsTheChatRule proves the WebSocket door obeys
// the same rule: a rejected frame is not stored and not delivered.
func TestPrivateMessageSocketRespectsTheChatRule(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner, stranger := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	stranger.login("alex@example.com")
	profile := decoded[models.SocialUser](t, owner.call("GET", "/api/v1/users/me", nil, 200))
	profile.IsPublic = false
	owner.call("PUT", "/api/v1/users/me", profile, 200)

	serverURL, _ := url.Parse(server.URL)
	socket := dialSocket(t, stranger, serverURL)
	defer socket.Close()

	countMessages := func() int {
		t.Helper()
		var count int
		if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM message").Scan(&count); err != nil {
			t.Fatal(err)
		}
		return count
	}
	before := countMessages()
	frame, err := json.Marshal(map[string]any{
		"type":    "private_msg",
		"payload": map[string]string{"recipientId": "dummy-id", "text": "socket stranger"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := socket.WriteMessage(websocket.TextMessage, frame); err != nil {
		t.Fatal(err)
	}
	time.Sleep(400 * time.Millisecond)
	if after := countMessages(); after != before {
		t.Fatalf("the socket stored a message that the rule forbids (%d -> %d)", before, after)
	}

	// The same socket still works once a follow exists.
	owner.call("PUT", "/api/v1/users/alex-id/follow", nil, 200)
	if err := socket.WriteMessage(websocket.TextMessage, frame); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for countMessages() == before && time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
	}
	if after := countMessages(); after != before+1 {
		t.Fatalf("the permitted socket message was not stored (%d -> %d)", before, after)
	}
}

func dialSocket(t *testing.T, client integrationClient, serverURL *url.URL) *websocket.Conn {
	t.Helper()
	cookies := []string{}
	for _, cookie := range client.client.Jar.Cookies(serverURL) {
		cookies = append(cookies, cookie.Name+"="+cookie.Value)
	}
	socket, _, err := websocket.DefaultDialer.Dial(
		"ws"+strings.TrimPrefix(serverURL.String(), "http")+"/ws",
		http.Header{"Cookie": {strings.Join(cookies, "; ")}, "Origin": {serverURL.String()}},
	)
	if err != nil {
		t.Fatal(err)
	}
	return socket
}

// TestChatPermissionRule covers the spec line that private messages are only
// possible between users where at least one follows the other, unless the
// recipient has a public profile.
func TestChatPermissionRule(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	dummy, alex := newIntegrationClient(t, server), newIntegrationClient(t, server)
	dummy.login("dummy@example.com")
	alex.login("alex@example.com")

	// A private recipient is the interesting case; Alex stays public.
	profile := decoded[models.SocialUser](t, dummy.call("GET", "/api/v1/users/me", nil, 200))
	profile.IsPublic = false
	dummy.call("PUT", "/api/v1/users/me", profile, 200)

	// Stranger -> private profile: no send, no read, no inbox entry, no flag.
	privateMessage(t, alex, "dummy-id", "hello stranger", 403)
	alex.call("GET", "/api/v1/messages?partnerId=dummy-id", nil, 403)
	alex.call("POST", "/api/v1/messages/read", map[string]any{"partnerId": "dummy-id"}, 403)
	if inbox := decoded[[]message.ChatUserDTO](t, alex.call("GET", "/api/v1/messages/users", nil, 200)); len(inbox) != 0 {
		t.Fatalf("a stranger sees the blocked thread in the inbox: %+v", inbox)
	}
	if seen := decoded[models.SocialUser](t, alex.call("GET", "/api/v1/users/dummy-id", nil, 200)); seen.CanMessage {
		t.Fatal("a private profile claimed the viewer can message it")
	}

	// Stranger -> public profile is allowed in both directions.
	privateMessage(t, dummy, "alex-id", "hello public profile", 201)
	if seen := decoded[models.SocialUser](t, dummy.call("GET", "/api/v1/users/alex-id", nil, 200)); !seen.CanMessage {
		t.Fatal("a public profile must be messageable")
	}
	alex.call("GET", "/api/v1/messages?partnerId=dummy-id", nil, 403)

	// One-way follow (Dummy follows Alex) unlocks the private profile too,
	// because a follow in either direction is enough.
	dummy.call("PUT", "/api/v1/users/alex-id/follow", nil, 200)
	privateMessage(t, alex, "dummy-id", "one-way reply", 201)
	alex.call("GET", "/api/v1/messages?partnerId=dummy-id", nil, 200)
	inbox := decoded[[]message.ChatUserDTO](t, alex.call("GET", "/api/v1/messages/users", nil, 200))
	if len(inbox) != 1 || inbox[0].UserId != "dummy-id" {
		t.Fatalf("the unlocked thread is missing from the inbox: %+v", inbox)
	}

	// Mutual follow keeps working, and unfollowing both ways closes it again.
	alex.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200)
	dummy.call("PUT", "/api/v1/follow-requests/alex-id", nil, 200)
	privateMessage(t, alex, "dummy-id", "mutual reply", 201)
	alex.call("DELETE", "/api/v1/users/dummy-id/follow", nil, 200)
	dummy.call("DELETE", "/api/v1/users/alex-id/follow", nil, 200)
	privateMessage(t, alex, "dummy-id", "after unfollow", 403)
	alex.call("GET", "/api/v1/messages?partnerId=dummy-id", nil, 403)

	// Hiding a thread must never delete the rows behind it.
	var rows int
	if err := repo.Conn.QueryRow(`SELECT COUNT(*) FROM message
		WHERE (senderId='dummy-id' AND recipientId='alex-id') OR (senderId='alex-id' AND recipientId='dummy-id')`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 3 {
		t.Fatalf("expected the three delivered messages to survive hiding, found %d", rows)
	}
}
