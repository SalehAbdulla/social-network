package tests

import (
	"testing"
)

func TestStoriesRespectProfilePrivacy(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	author, viewer := newIntegrationClient(t, server), newIntegrationClient(t, server)
	author.login("dummy@example.com")
	viewer.login("alex@example.com")

	created := decoded[map[string]int](t, author.call("POST", "/api/v1/stories", map[string]string{
		"content": "Followers only", "mediaType": "text", "backgroundColor": "#4f46e5",
	}, 201))

	if _, ok := storyByID(storiesFor(t, viewer), created["storyId"]); !ok {
		t.Fatalf("a public author's story is hidden from a reader")
	}
	if own := storiesFor(t, author); len(own) == 0 || own[0].StoryID != created["storyId"] {
		t.Fatalf("the author's own story does not lead their listing: %+v", own)
	}

	for _, q := range []string{
		"UPDATE user SET isPublic=0 WHERE userId='dummy-id'",
		"DELETE FROM follow WHERE followerId='alex-id' AND followedId='dummy-id'",
		"DELETE FROM connection WHERE requesterId='alex-id' AND recipientId='dummy-id'",
	} {
		if _, err := repo.Conn.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	if _, ok := storyByID(storiesFor(t, viewer), created["storyId"]); ok {
		t.Fatalf("a private author's story leaked to a non-follower")
	}
	if _, ok := storyByID(storiesFor(t, author), created["storyId"]); !ok {
		t.Fatalf("a private author lost their own story")
	}

	state := decoded[map[string]string](t, viewer.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200))
	if state["status"] != "pending" {
		t.Fatalf("following a private author did not pend: %v", state)
	}
	if _, ok := storyByID(storiesFor(t, viewer), created["storyId"]); ok {
		t.Fatalf("a pending follow request exposed a private author's story")
	}

	author.call("PUT", "/api/v1/follow-requests/alex-id", nil, 200)
	if _, ok := storyByID(storiesFor(t, viewer), created["storyId"]); !ok {
		t.Fatalf("an accepted follower cannot see a private author's story")
	}
}
