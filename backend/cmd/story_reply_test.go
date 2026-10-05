package main

import (
	"strconv"
	"strings"
	"testing"

	"social-network/backend/pkg/models"
)

// TestStoryReplyIntegration walks a story's replies: a reader may leave one on a live story, the
// author — and only the author — reads them back, and the write obeys both the story's life and
// the chat rule that gates private messages.
func TestStoryReplyIntegration(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	author, reader := newIntegrationClient(t, server), newIntegrationClient(t, server)
	author.login("dummy@example.com")
	reader.login("alex@example.com")

	created := decoded[map[string]int](t, author.call("POST", "/api/v1/stories", map[string]string{
		"content": "Reply to me", "mediaType": "text", "backgroundColor": "#4f46e5",
	}, 201))
	story := strconv.Itoa(created["storyId"])
	replyPath := "/api/v1/stories/" + story + "/reply"
	repliesPath := "/api/v1/stories/" + story + "/replies"

	// A reader leaves a reply; the author reads it back, and it names the reader.
	createdReply := decoded[map[string]int](t, reader.call("POST", replyPath, map[string]string{"content": "love this"}, 201))
	if createdReply["replyId"] < 1 || createdReply["storyId"] != created["storyId"] {
		t.Fatalf("reply response = %+v, want a fresh id and the story it answers", createdReply)
	}
	replies := decoded[[]models.StoryReply](t, author.call("GET", repliesPath, nil, 200))
	if len(replies) != 1 || replies[0].UserID != "alex-id" || replies[0].Nickname == "" ||
		replies[0].Content != "love this" || replies[0].StoryID != created["storyId"] {
		t.Fatalf("the author's replies = %+v, want the one reader's", replies)
	}

	// Only the author: a reader gets the same 404 as a story that does not exist, so the route
	// cannot be used to learn that someone else's story exists or was replied to.
	reader.call("GET", repliesPath, nil, 404)
	reader.call("GET", "/api/v1/stories/999999/replies", nil, 404)

	// The author answering themselves is a 400 — a reply is read by the author, so there is no
	// reader on the other side of it. An empty or over-long reply is a 400 too, and an unknown
	// story is the same 404 a read gives.
	author.call("POST", replyPath, map[string]string{"content": "me"}, 400)
	reader.call("POST", replyPath, map[string]string{"content": "   "}, 400)
	reader.call("POST", replyPath, map[string]string{"content": strings.Repeat("x", 1001)}, 400)
	reader.call("POST", "/api/v1/stories/999999/reply", map[string]string{"content": "hi"}, 404)

	// A reply obeys the chat rule: while the author's profile is private and the reader does not
	// follow them, the reply is refused — a story is not a way around the rule that gates DMs.
	if _, err := repo.Conn.Exec("UPDATE user SET isPublic=0 WHERE userId='dummy-id'"); err != nil {
		t.Fatal(err)
	}
	reader.call("POST", replyPath, map[string]string{"content": "blocked"}, 403)

	// An expired story takes no new replies, the same 404 a view gives...
	if _, err := repo.Conn.Exec("UPDATE story SET expiresAt=datetime('now','-1 second') WHERE storyId=?", created["storyId"]); err != nil {
		t.Fatal(err)
	}
	reader.call("POST", replyPath, map[string]string{"content": "too late"}, 404)
	// ...but the author keeps the reply that was already left, which is what makes it a record.
	if kept := decoded[[]models.StoryReply](t, author.call("GET", repliesPath, nil, 200)); len(kept) != 1 {
		t.Fatalf("an expired story lost the replies it had: %+v", kept)
	}

	// Deleting the story takes its replies with it, rather than leaving rows the next story to
	// reuse the id would inherit.
	author.call("DELETE", "/api/v1/stories/"+story, nil, 200)
	var rows int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM storyReply WHERE storyId=?", created["storyId"]).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 0 {
		t.Fatalf("deleting the story left %d of its replies behind", rows)
	}
}
