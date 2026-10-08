package main

import (
	"bytes"
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

type socketFrame struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

func waitForFrame(t *testing.T, socket *websocket.Conn, wantType string, within time.Duration) socketFrame {
	t.Helper()
	deadline := time.Now().Add(within)
	seen := []string{}
	for time.Now().Before(deadline) {
		socket.SetReadDeadline(deadline)
		_, data, err := socket.ReadMessage()
		if err != nil {
			t.Fatalf("waiting for a %q frame: saw %v, then %v", wantType, seen, err)
		}
		for _, line := range bytes.Split(data, []byte("\n")) {
			var frame socketFrame
			if err := json.Unmarshal(line, &frame); err != nil {
				continue
			}
			if frame.Type == wantType {
				return frame
			}
			seen = append(seen, frame.Type)
		}
	}
	t.Fatalf("no %q frame arrived within %s: saw %v", wantType, within, seen)
	return socketFrame{}
}

func TestPrivateMessageSocketDelivery(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	senderClient, recipientClient := newIntegrationClient(t, server), newIntegrationClient(t, server)
	senderClient.login("dummy@example.com")
	recipientClient.login("alex@example.com")
	serverURL, _ := url.Parse(server.URL)

	sender := dialSocket(t, senderClient, serverURL)
	defer sender.Close()
	recipient := dialSocket(t, recipientClient, serverURL)
	defer recipient.Close()

	countMessages := func() int {
		t.Helper()
		var count int
		if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM message").Scan(&count); err != nil {
			t.Fatal(err)
		}
		return count
	}
	unread := func() int {
		t.Helper()
		var count int
		if err := repo.Conn.QueryRow(
			`SELECT COUNT(*) FROM notification
			 WHERE userId='alex-id' AND actorId='dummy-id' AND entityType='message' AND isRead=0`,
		).Scan(&count); err != nil {
			t.Fatal(err)
		}
		return count
	}
	send := func(socket *websocket.Conn, recipientID, text string) {
		t.Helper()
		frame, err := json.Marshal(map[string]any{
			"type":    "private_msg",
			"payload": map[string]string{"recipientId": recipientID, "text": text},
		})
		if err != nil {
			t.Fatal(err)
		}
		if err := socket.WriteMessage(websocket.TextMessage, frame); err != nil {
			t.Fatal(err)
		}
	}

	before := countMessages()
	send(sender, "alex-id", "straight to the socket")
	incoming := waitForFrame(t, recipient, "incoming_msg", 5*time.Second)
	var delivered struct {
		MessageId      int    `json:"messageId"`
		SenderId       string `json:"senderId"`
		SenderNickname string `json:"senderNickname"`
		Text           string `json:"text"`
		TimeStamp      string `json:"timeStamp"`
	}
	if err := json.Unmarshal(incoming.Payload, &delivered); err != nil {
		t.Fatal(err)
	}
	if delivered.MessageId < 1 || delivered.SenderId != "dummy-id" ||
		delivered.Text != "straight to the socket" || delivered.TimeStamp == "" {
		t.Fatalf("the delivered frame does not match the stored message: %+v", delivered)
	}
	if delivered.SenderNickname == "" || delivered.SenderNickname == "dummy-id" {
		t.Fatalf("the delivered frame carries no readable sender name: %+v", delivered)
	}
	if after := countMessages(); after != before+1 {
		t.Fatalf("expected exactly one stored message, %d -> %d", before, after)
	}

	echo := waitForFrame(t, sender, "incoming_msg", 5*time.Second)
	var echoed struct {
		MessageId int `json:"messageId"`
	}
	if err := json.Unmarshal(echo.Payload, &echoed); err != nil {
		t.Fatal(err)
	}
	if echoed.MessageId != delivered.MessageId {
		t.Fatalf("the sender's echo is a different message: %d vs %d", echoed.MessageId, delivered.MessageId)
	}

	if got := unread(); got != 1 {
		t.Fatalf("expected one unread message notification, found %d", got)
	}
	notification := waitForFrame(t, recipient, "notification", 5*time.Second)
	var notice struct {
		ActorId    string `json:"actorId"`
		EntityType string `json:"entityType"`
		EntityId   int    `json:"entityId"`
	}
	if err := json.Unmarshal(notification.Payload, &notice); err != nil {
		t.Fatal(err)
	}
	if notice.ActorId != "dummy-id" || notice.EntityType != "message" || notice.EntityId != delivered.MessageId {
		t.Fatalf("the pushed notification does not point at the message: %+v", notice)
	}

	openChat, err := json.Marshal(map[string]any{"type": "open_chat", "payload": map[string]string{"partnerId": "dummy-id"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := recipient.WriteMessage(websocket.TextMessage, openChat); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for unread() != 0 && time.Now().Before(deadline) {
		time.Sleep(25 * time.Millisecond)
	}
	if got := unread(); got != 0 {
		t.Fatalf("open_chat did not mark the chat read, %d still unread", got)
	}

	send(sender, "alex-id", "while the chat is open")
	second := waitForFrame(t, recipient, "incoming_msg", 5*time.Second)
	if !bytes.Contains(second.Payload, []byte("while the chat is open")) {
		t.Fatalf("the second frame is not the second message: %s", second.Payload)
	}
	recipient.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	if _, data, err := recipient.ReadMessage(); err == nil {
		t.Fatalf("an open chat was pushed something extra: %s", data)
	}
	if got := unread(); got != 0 {
		t.Fatalf("an open chat still raised a notification, %d unread", got)
	}

	profile := decoded[models.SocialUser](t, senderClient.call("GET", "/api/v1/users/me", nil, 200))
	profile.IsPublic = false
	senderClient.call("PUT", "/api/v1/users/me", profile, 200)

	blockedSender := dialSocket(t, recipientClient, serverURL)
	defer blockedSender.Close()
	blockedRecipient := dialSocket(t, senderClient, serverURL)
	defer blockedRecipient.Close()

	before = countMessages()
	send(blockedSender, "dummy-id", "a stranger should not land")
	blockedRecipient.SetReadDeadline(time.Now().Add(700 * time.Millisecond))
	if _, data, err := blockedRecipient.ReadMessage(); err == nil {
		t.Fatalf("a forbidden frame was delivered to the recipient: %s", data)
	}
	if after := countMessages(); after != before {
		t.Fatalf("a forbidden frame was stored (%d -> %d)", before, after)
	}
	if got := unread(); got != 0 {
		t.Fatalf("a forbidden frame raised a notification, %d unread", got)
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

func TestChatPermissionRule(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	dummy, alex := newIntegrationClient(t, server), newIntegrationClient(t, server)
	dummy.login("dummy@example.com")
	alex.login("alex@example.com")

	profile := decoded[models.SocialUser](t, dummy.call("GET", "/api/v1/users/me", nil, 200))
	profile.IsPublic = false
	dummy.call("PUT", "/api/v1/users/me", profile, 200)

	privateMessage(t, alex, "dummy-id", "hello stranger", 403)
	alex.call("GET", "/api/v1/messages?partnerId=dummy-id", nil, 403)
	alex.call("POST", "/api/v1/messages/read", map[string]any{"partnerId": "dummy-id"}, 403)
	if inbox := decoded[[]message.ChatUserDTO](t, alex.call("GET", "/api/v1/messages/users", nil, 200)); len(inbox) != 0 {
		t.Fatalf("a stranger sees the blocked thread in the inbox: %+v", inbox)
	}
	if seen := decoded[models.SocialUser](t, alex.call("GET", "/api/v1/users/dummy-id", nil, 200)); seen.CanMessage {
		t.Fatal("a private profile claimed the viewer can message it")
	}
	if listed := decoded[[]models.SocialUser](t, alex.call("GET", "/api/v1/users?q=dummy", nil, 200)); len(listed) != 1 || listed[0].CanMessage {
		t.Fatalf("discover offered a blocked chat: %+v", listed)
	}

	privateMessage(t, dummy, "alex-id", "hello public profile", 201)
	if seen := decoded[models.SocialUser](t, dummy.call("GET", "/api/v1/users/alex-id", nil, 200)); !seen.CanMessage {
		t.Fatal("a public profile must be messageable")
	}
	alex.call("GET", "/api/v1/messages?partnerId=dummy-id", nil, 403)

	dummy.call("PUT", "/api/v1/users/alex-id/follow", nil, 200)
	privateMessage(t, alex, "dummy-id", "one-way reply", 201)
	if listed := decoded[[]models.SocialUser](t, alex.call("GET", "/api/v1/users?q=dummy", nil, 200)); len(listed) != 1 || !listed[0].CanMessage {
		t.Fatalf("discover still hid an unlocked chat: %+v", listed)
	}
	alex.call("GET", "/api/v1/messages?partnerId=dummy-id", nil, 200)
	inbox := decoded[[]message.ChatUserDTO](t, alex.call("GET", "/api/v1/messages/users", nil, 200))
	if len(inbox) != 1 || inbox[0].UserId != "dummy-id" {
		t.Fatalf("the unlocked thread is missing from the inbox: %+v", inbox)
	}

	alex.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200)
	dummy.call("PUT", "/api/v1/follow-requests/alex-id", nil, 200)
	privateMessage(t, alex, "dummy-id", "mutual reply", 201)
	alex.call("DELETE", "/api/v1/users/dummy-id/follow", nil, 200)
	dummy.call("DELETE", "/api/v1/users/alex-id/follow", nil, 200)
	privateMessage(t, alex, "dummy-id", "after unfollow", 403)
	alex.call("GET", "/api/v1/messages?partnerId=dummy-id", nil, 403)

	var rows int
	if err := repo.Conn.QueryRow(`SELECT COUNT(*) FROM message
		WHERE (senderId='dummy-id' AND recipientId='alex-id') OR (senderId='alex-id' AND recipientId='dummy-id')`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 3 {
		t.Fatalf("expected the three delivered messages to survive hiding, found %d", rows)
	}
}
