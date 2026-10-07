package main

import (
	"testing"
)

// TestStoriesRespectProfilePrivacy proves the story strip is not a hole in a private account:
// a story is shown to its author and to the accepted followers of a private author, never to a
// stranger — the same rule the profile and the feed already keep.
func TestStoriesRespectProfilePrivacy(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	writer, reader := newIntegrationClient(t, server), newIntegrationClient(t, server)
	writer.login("dummy@example.com")
	reader.login("alex@example.com")

	created := decoded[map[string]int](t, writer.call("POST", "/api/v1/stories", map[string]string{
		"content": "Followers only", "mediaType": "text", "backgroundColor": "#4f46e5",
	}, 201))

	// A public author's story still reaches everyone, unchanged.
	if _, ok := storyByID(storiesFor(t, reader), created["storyId"]); !ok {
		t.Fatalf("a public author's story is hidden from a reader")
	}

	// Turn the author private and drop any follow, so the reader is now a stranger.
	if _, err := repo.Conn.Exec("UPDATE user SET isPublic=0 WHERE userId='dummy-id'"); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Conn.Exec("DELETE FROM follow WHERE followerId='alex-id' AND followedId='dummy-id'"); err != nil {
		t.Fatal(err)
	}
	if _, ok := storyByID(storiesFor(t, reader), created["storyId"]); ok {
		t.Fatalf("a private author's story leaked to a non-follower")
	}
	// The author still sees their own story.
	if _, ok := storyByID(storiesFor(t, writer), created["storyId"]); !ok {
		t.Fatalf("a private author lost their own story")
	}

	// An accepted follow is what opens it: the reader now sees the story.
	if _, err := repo.Conn.Exec("INSERT INTO follow (followerId, followedId) VALUES ('alex-id','dummy-id')"); err != nil {
		t.Fatal(err)
	}
	if _, ok := storyByID(storiesFor(t, reader), created["storyId"]); !ok {
		t.Fatalf("an accepted follower cannot see a private author's story")
	}
}
