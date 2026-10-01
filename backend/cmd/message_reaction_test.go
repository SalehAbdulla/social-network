package main

import (
	"strconv"
	"testing"

	"social-network/backend/pkg/payload/message"
)

// reactTo posts one reaction and answers with the resulting total.
func reactTo(t *testing.T, client integrationClient, entityType string, entityId, score int) int {
	t.Helper()
	response := decoded[map[string]any](t, client.call("POST", "/api/v1/reactions", map[string]any{
		"entityType": entityType, "entityId": entityId, "score": score,
	}, 200))
	total, ok := response["totalScore"].(float64)
	if !ok {
		t.Fatalf("the reaction answer carried no total: %+v", response)
	}
	return int(total)
}

// messagesBetween reads the newest page of one conversation from the viewer's side.
func messagesBetween(t *testing.T, client integrationClient, partnerID string) message.MessagesResponse {
	t.Helper()
	return decoded[message.MessagesResponse](t, client.call("GET", "/api/v1/messages?partnerId="+partnerID, nil, 200))
}

// TestMessageReactionIntegration covers reacting to a chat message, which reuses the
// reaction table and the endpoint that posts and comments already use. The two things
// that are new are the rule — a message belongs to exactly two people — and the total
// being computed per reader rather than kept in a column on the message.
func TestMessageReactionIntegration(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	sender, receiver := newIntegrationClient(t, server), newIntegrationClient(t, server)
	sender.login("dummy@example.com")
	receiver.login("alex@example.com")
	// Both seeded accounts are public, so the chat rule is satisfied and one message
	// between them makes a thread.
	sent := decoded[message.MessageDTO](t, sender.call("POST", "/api/v1/messages", map[string]any{
		"recipientId": "alex-id", "text": "A message to react to.", "mediaUrl": "", "mediaType": "",
	}, 201))

	if total := reactTo(t, receiver, "message", sent.MessageId, 1); total != 1 {
		t.Fatalf("one reaction should make the total one, got %d", total)
	}

	// Both sides see the total; only the reader who reacted sees their own score, and that
	// difference is the whole reason the field is viewer-relative.
	fromReceiver := messagesBetween(t, receiver, "dummy-id").Messages
	if len(fromReceiver) == 0 || fromReceiver[0].Score != 1 || fromReceiver[0].UserScore != 1 {
		t.Fatalf("the one who reacted must see the total and their own score: %+v", fromReceiver)
	}
	fromSender := messagesBetween(t, sender, "alex-id").Messages
	if len(fromSender) == 0 || fromSender[0].Score != 1 || fromSender[0].UserScore != 0 {
		t.Fatalf("the other side must see the total but not the other's score: %+v", fromSender)
	}

	// Reacting again with the same score takes it back — that toggle is what the button
	// on the bubble does, and it is the endpoint's existing behaviour rather than a new one.
	if total := reactTo(t, receiver, "message", sent.MessageId, 1); total != 0 {
		t.Fatalf("reacting twice should remove the reaction, got %d", total)
	}

	// Someone who is not in the conversation cannot react, and the answer is not-found
	// rather than forbidden: whether the message exists is not theirs to learn.
	outsider := newIntegrationClient(t, server)
	outsider.call("POST", "/api/v1/auth/register", registerValues("Out", "Sider", "outsider@example.com"), 201)
	outsider.call("POST", "/api/v1/reactions", map[string]any{"entityType": "message", "entityId": sent.MessageId, "score": 1}, 404)
	outsider.call("POST", "/api/v1/reactions", map[string]any{"entityType": "message", "entityId": 999999, "score": 1}, 404)

	// Deleting a message takes its reactions with it — the trigger `000015` adds. It is
	// asserted against the table itself, because there is no endpoint that could report an
	// orphan, and an orphan is exactly what the missing trigger would have left.
	reactTo(t, sender, "message", sent.MessageId, 1)
	sender.call("DELETE", "/api/v1/messages/"+strconv.Itoa(sent.MessageId)+"?scope=everyone", nil, 200)
	var remaining int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM reaction WHERE entityType='message' AND entityId=?", sent.MessageId).Scan(&remaining); err != nil {
		t.Fatal(err)
	}
	if remaining != 0 {
		t.Fatalf("deleting a message left %d reactions behind", remaining)
	}
}
