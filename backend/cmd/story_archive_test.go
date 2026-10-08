package main

import (
	"strconv"
	"testing"

	"social-network/backend/pkg/models"
)

func TestStoryArchiveIntegration(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	author, other := newIntegrationClient(t, server), newIntegrationClient(t, server)
	author.login("dummy@example.com")
	other.login("alex@example.com")

	live := decoded[map[string]int](t, author.call("POST", "/api/v1/stories", map[string]string{
		"content": "Still live", "mediaType": "text", "backgroundColor": "#4f46e5",
	}, 201))
	if archived := decoded[[]models.Story](t, author.call("GET", "/api/v1/stories/archive", nil, 200)); len(archived) != 0 {
		t.Fatalf("a live story is already archived: %+v", archived)
	}

	if _, err := repo.Conn.Exec("UPDATE story SET expiresAt=datetime('now','-1 second') WHERE storyId=?", live["storyId"]); err != nil {
		t.Fatal(err)
	}
	if story, ok := storyByID(storiesFor(t, author), live["storyId"]); ok {
		t.Fatalf("an expired story is still in the strip: %+v", story)
	}
	archived := decoded[[]models.Story](t, author.call("GET", "/api/v1/stories/archive", nil, 200))
	if len(archived) != 1 || archived[0].StoryID != live["storyId"] || archived[0].Content != "Still live" {
		t.Fatalf("the author's archive = %+v, want the one expired story", archived)
	}

	if theirs := decoded[[]models.Story](t, other.call("GET", "/api/v1/stories/archive", nil, 200)); len(theirs) != 0 {
		t.Fatalf("another member's archive exposed a story that is not theirs: %+v", theirs)
	}

	author.call("DELETE", "/api/v1/stories/"+strconv.Itoa(live["storyId"]), nil, 200)
	if again := decoded[[]models.Story](t, author.call("GET", "/api/v1/stories/archive", nil, 200)); len(again) != 0 {
		t.Fatalf("a deleted story stayed in the archive: %+v", again)
	}
}
