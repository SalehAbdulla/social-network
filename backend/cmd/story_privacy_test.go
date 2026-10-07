package main

import (
	"testing"
)

// TestStoriesRespectProfilePrivacy proves the story strip is not a hole in a private account: a
// story reaches its author and the accepted followers of a private author, never a stranger — and
// a *request* to follow is not enough, so pending does not open it. It is the same rule the
// profile page and the feed already keep.
func TestStoriesRespectProfilePrivacy(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	author, viewer := newIntegrationClient(t, server), newIntegrationClient(t, server)
	author.login("dummy@example.com")
	viewer.login("alex@example.com")

	created := decoded[map[string]int](t, author.call("POST", "/api/v1/stories", map[string]string{
		"content": "Followers only", "mediaType": "text", "backgroundColor": "#4f46e5",
	}, 201))

	// A public author's story still reaches everyone, unchanged.
	if _, ok := storyByID(storiesFor(t, viewer), created["storyId"]); !ok {
		t.Fatalf("a public author's story is hidden from a reader")
	}
	// The viewer's own stories lead their own listing, so their own tile always sees them
	// however many other authors they follow.
	if own := storiesFor(t, author); len(own) == 0 || own[0].StoryID != created["storyId"] {
		t.Fatalf("the author's own story does not lead their listing: %+v", own)
	}

	// Turn the author private and clear any relationship, so the viewer is a stranger.
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
	// The author still sees their own story.
	if _, ok := storyByID(storiesFor(t, author), created["storyId"]); !ok {
		t.Fatalf("a private author lost their own story")
	}

	// A request to follow is not a follow: the story stays hidden until the author accepts it.
	state := decoded[map[string]string](t, viewer.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200))
	if state["status"] != "pending" {
		t.Fatalf("following a private author did not pend: %v", state)
	}
	if _, ok := storyByID(storiesFor(t, viewer), created["storyId"]); ok {
		t.Fatalf("a pending follow request exposed a private author's story")
	}

	// Acceptance is what opens it: the viewer now sees the story.
	author.call("PUT", "/api/v1/follow-requests/alex-id", nil, 200)
	if _, ok := storyByID(storiesFor(t, viewer), created["storyId"]); !ok {
		t.Fatalf("an accepted follower cannot see a private author's story")
	}
}
