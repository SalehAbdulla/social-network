package tests

import (
	"fmt"
	"testing"

	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/message"
)

// A reply has to keep the message it answers: the row stores the pointer and the
// read carries the parent's text and author, so the bubble can show what was
// replied to after the send — and after a reload. That preview is the whole point
// of the reply control, and it used to be thrown away the moment the send landed.
func TestDirectChatReplyRoundTrips(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	author, partner := newIntegrationClient(t, server), newIntegrationClient(t, server)
	author.login("dummy@example.com")
	partner.login("alex@example.com")
	// The chat rule ties a conversation to a follow, so the sender has to follow
	// before a private message is allowed at all.
	openChat(t, author, "alex-id")

	first := decoded[message.MessageDTO](t, author.call("POST", "/api/v1/messages", map[string]any{
		"recipientId": "alex-id", "text": "Are we still on for tomorrow?",
	}, 201))

	reply := decoded[message.MessageDTO](t, author.call("POST", "/api/v1/messages", map[string]any{
		"recipientId": "alex-id", "text": "Yes, see you at ten.", "replyToId": first.MessageId,
	}, 201))
	if reply.ReplyToId != first.MessageId || reply.ReplyToText != first.TextMessage || reply.ReplyToSenderId != "dummy-id" {
		t.Fatalf("a reply must carry what it answered, got %+v", reply)
	}

	thread := decoded[message.MessagesResponse](t, partner.call("GET", "/api/v1/messages?partnerId=dummy-id", nil, 200))
	var found *message.MessageDTO
	for i := range thread.Messages {
		if thread.Messages[i].MessageId == reply.MessageId {
			found = &thread.Messages[i]
		}
	}
	if found == nil {
		t.Fatalf("the reply was not in the thread: %+v", thread.Messages)
	}
	if found.ReplyToId != first.MessageId || found.ReplyToText != first.TextMessage || found.ReplyToSenderId != "dummy-id" {
		t.Fatalf("the thread lost the reply preview: %+v", *found)
	}

	// When the message it answered is deleted, the reply stops claiming a parent
	// rather than pointing at nothing and drawing an empty quote.
	author.call("DELETE", fmt.Sprintf("/api/v1/messages/%d?scope=everyone", first.MessageId), nil, 200)
	after := decoded[message.MessagesResponse](t, partner.call("GET", "/api/v1/messages?partnerId=dummy-id", nil, 200))
	for _, msg := range after.Messages {
		if msg.MessageId == reply.MessageId && msg.ReplyToId != 0 {
			t.Fatalf("a reply kept a parent that was deleted: %+v", msg)
		}
	}

	// A reply may only quote a message from the same conversation, or the preview
	// would leak another chat's text back to the reader.
	if err := repo.InsertUser(models.Registration{
		UserID: "carol-id", Nickname: "caroldemo", FirstName: "Carol", LastName: "User",
		Email: "carol@example.com", PasswordHash: "x", BirthDate: "2000-01-01", BirthYear: 2000, Gender: "female", IsPublic: true,
	}); err != nil {
		t.Fatal(err)
	}
	openChat(t, author, "carol-id")
	elsewhere := decoded[message.MessageDTO](t, author.call("POST", "/api/v1/messages", map[string]any{
		"recipientId": "carol-id", "text": "A message in another chat.",
	}, 201))
	author.call("POST", "/api/v1/messages", map[string]any{
		"recipientId": "alex-id", "text": "quoted from another chat", "replyToId": elsewhere.MessageId,
	}, 400)
	author.call("POST", "/api/v1/messages", map[string]any{
		"recipientId": "alex-id", "text": "quoted from nowhere", "replyToId": 999999,
	}, 400)
}

// A group chat reply carries the same preview, and may only point at a message in
// the same group.
func TestGroupChatReplyRoundTrips(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	owner := newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	group := decoded[models.Group](t, owner.call("POST", "/api/v1/groups", map[string]string{"title": "Reply group"}, 201))
	base := fmt.Sprintf("/api/v1/groups/%d/content/messages", group.GroupID)

	first := decoded[models.GroupContent](t, owner.call("POST", base, map[string]string{"content": "Anyone around?"}, 201))
	reply := decoded[models.GroupContent](t, owner.call("POST", base, map[string]any{"content": "Right here.", "replyToId": first.ID}, 201))
	if reply.ReplyToId != first.ID {
		t.Fatalf("the created reply did not echo its parent, got %+v", reply)
	}

	items := decoded[[]models.GroupContent](t, owner.call("GET", base, nil, 200))
	var found *models.GroupContent
	for i := range items {
		if items[i].ID == reply.ID {
			found = &items[i]
		}
	}
	if found == nil {
		t.Fatalf("the reply was not in the group chat: %+v", items)
	}
	if found.ReplyToId != first.ID || found.ReplyToText != "Anyone around?" || found.ReplyToSenderId != "dummy-id" {
		t.Fatalf("the group thread lost the reply preview: %+v", *found)
	}

	// Only a chat message may be replied to, and only one in this same group.
	owner.call("POST", base, map[string]any{"content": "bad target", "replyToId": 999999}, 400)
	post := decoded[models.GroupContent](t, owner.call("POST", fmt.Sprintf("/api/v1/groups/%d/content/posts", group.GroupID), map[string]string{"content": "A post"}, 201))
	owner.call("POST", base, map[string]any{"content": "not a message", "replyToId": post.ID}, 400)
}
