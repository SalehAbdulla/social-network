package main

import (
	"strconv"
	"testing"

	"social-network/backend/pkg/payload/notification"
	"social-network/backend/pkg/payload/posts"
)

func TestNotificationTypeFilters(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	dummy, alex := newIntegrationClient(t, server), newIntegrationClient(t, server)
	dummy.login("dummy@example.com")
	alex.login("alex@example.com")

	post := decoded[posts.PostDTO](t, dummy.call("POST", "/api/v1/posts", map[string]any{
		"title": "Filter post", "content": "A comment here notifies the author.", "privacy": "public",
	}, 201))
	alex.call("POST", "/api/v1/posts/comments", map[string]any{"postId": post.PostId, "content": "A browser-free comment"}, 201)
	alex.call("POST", "/api/v1/messages", map[string]any{"recipientId": "dummy-id", "text": "A private message"}, 201)

	count := func(query string) int {
		t.Helper()
		return decoded[notification.UnreadCountResponse](t, dummy.call("GET", "/api/v1/notifications/unread-count"+query, nil, 200)).Count
	}
	counts := func() notification.UnreadCountsResponse {
		t.Helper()
		return decoded[notification.UnreadCountsResponse](t, dummy.call("GET", "/api/v1/notifications/unread-counts", nil, 200))
	}
	list := func(query string) notification.NotificationResponse {
		t.Helper()
		return decoded[notification.NotificationResponse](t, dummy.call("GET", "/api/v1/notifications?limit=20"+query, nil, 200))
	}

	if got := count(""); got != 2 {
		t.Fatalf("unfiltered unread count = %d, want 2", got)
	}
	listed := list("")
	if listed.TotalElements != 2 || len(listed.Notifications) != 2 {
		t.Fatalf("unfiltered list = %+v, want both notifications", listed)
	}

	if got := count("?exclude=message"); got != 1 {
		t.Fatalf("bell count = %d, want 1", got)
	}
	if got := count("?types=message"); got != 1 {
		t.Fatalf("message count = %d, want 1", got)
	}
	if got := counts(); got.Notifications != 1 || got.Messages != 1 {
		t.Fatalf("combined unread counts = %+v, want bell 1 and message 1", got)
	}
	if got := count("?types=comment,follow"); got != 1 {
		t.Fatalf("comment+follow count = %d, want 1", got)
	}
	if got := count("?types=follow"); got != 0 {
		t.Fatalf("follow-only count = %d, want 0", got)
	}
	if got := count("?exclude=comment,follow,group_invitation,group_request,group_event"); got != 1 {
		t.Fatalf("message-survives-exclusions count = %d, want 1", got)
	}
	if got := count("?types=message&exclude=message"); got != 0 {
		t.Fatalf("message excluded from messages count = %d, want 0", got)
	}
	if got := count("?exclude=message,comment"); got != 0 {
		t.Fatalf("everything excluded count = %d, want 0", got)
	}

	onlyMessages := list("&types=message")
	if len(onlyMessages.Notifications) != 1 || onlyMessages.TotalElements != 1 || onlyMessages.Notifications[0].EntityType != "message" {
		t.Fatalf("types=message list = %+v", onlyMessages)
	}
	withoutMessages := list("&exclude=message")
	if len(withoutMessages.Notifications) != 1 || withoutMessages.Notifications[0].EntityType == "message" {
		t.Fatalf("exclude=message list = %+v", withoutMessages)
	}
	unreadOnly := list("&unread=true&types=comment")
	if len(unreadOnly.Notifications) != 1 || unreadOnly.Notifications[0].EntityType != "comment" {
		t.Fatalf("unread comment list = %+v", unreadOnly)
	}

	for _, query := range []string{"?types=bogus", "?exclude=bogus", "?types=comment,bogus", "?types=messages"} {
		dummy.call("GET", "/api/v1/notifications/unread-count"+query, nil, 400)
		dummy.call("GET", "/api/v1/notifications"+query, nil, 400)
	}

	dummy.call("POST", "/api/v1/messages/read", map[string]string{"partnerId": "alex-id"}, 200)
	if got := count("?types=message"); got != 0 {
		t.Fatalf("message count after reading the chat = %d, want 0", got)
	}
	if got := count("?exclude=message"); got != 1 {
		t.Fatalf("bell count after reading the chat = %d, want 1", got)
	}
	if got := counts(); got.Notifications != 1 || got.Messages != 0 {
		t.Fatalf("combined counts after reading the chat = %+v, want bell 1 and message 0", got)
	}

	commentNotificationId := list("&types=comment").Notifications[0].NotificationId
	dummy.call("PATCH", "/api/v1/notifications/"+strconv.Itoa(commentNotificationId)+"/read", nil, 200)
	if got := count("?exclude=message"); got != 0 {
		t.Fatalf("bell count after reading the comment = %d, want 0", got)
	}
	if got := count("?types=message"); got != 0 {
		t.Fatalf("message count after reading the comment = %d, want 0", got)
	}
	if got := count(""); got != 0 {
		t.Fatalf("unfiltered count after reading everything = %d, want 0", got)
	}
	if got := counts(); got.Notifications != 0 || got.Messages != 0 {
		t.Fatalf("combined counts after reading everything = %+v, want zero", got)
	}
}
