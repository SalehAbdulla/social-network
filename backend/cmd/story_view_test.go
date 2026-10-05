package main

import (
	"strconv"
	"testing"

	"social-network/backend/pkg/models"
)

// storiesFor reads one page of the stories strip and returns the raw rows, so a test can
// read the viewer-relative `viewed` flag the ring is drawn from.
func storiesFor(t *testing.T, client integrationClient) []models.Story {
	t.Helper()
	return decoded[[]models.Story](t, client.call("GET", "/api/v1/stories", nil, 200))
}

// storyByID finds one row in a listing, or reports that it is absent — which is how the
// expired case shows that a dead story is not listed at all.
func storyByID(stories []models.Story, id int) (models.Story, bool) {
	for _, story := range stories {
		if story.StoryID == id {
			return story, true
		}
	}
	return models.Story{}, false
}

// TestStoryViewIntegration walks the seen/unseen ring: a story is unseen to everyone when
// it is written, opening it marks it seen for the reader alone, and the mark is idempotent.
// A story that is unknown or expired cannot be marked, and answers the same 404 a read
// would, so the endpoint is not a way to confirm that a dead story exists.
func TestStoryViewIntegration(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	writer, reader := newIntegrationClient(t, server), newIntegrationClient(t, server)
	writer.login("dummy@example.com")
	reader.login("alex@example.com")

	created := decoded[map[string]int](t, writer.call("POST", "/api/v1/stories", map[string]string{
		"content": "Ring me", "mediaType": "text", "backgroundColor": "#4f46e5",
	}, 201))
	viewPath := "/api/v1/stories/" + strconv.Itoa(created["storyId"]) + "/view"

	// Everyone starts with the story unseen, the writer included: "seen" records who opened
	// it, not who owns it.
	if story, ok := storyByID(storiesFor(t, reader), created["storyId"]); !ok || story.Viewed {
		t.Fatalf("a fresh story is not unseen to the reader: %+v (found=%v)", story, ok)
	}
	if story, ok := storyByID(storiesFor(t, writer), created["storyId"]); !ok || story.Viewed {
		t.Fatalf("a fresh story is not unseen to its writer: %+v (found=%v)", story, ok)
	}

	// Opening it marks it seen for that reader...
	reader.call("POST", viewPath, nil, 200)
	seen, ok := storyByID(storiesFor(t, reader), created["storyId"])
	if !ok || !seen.Viewed {
		t.Fatalf("the reader's ring did not turn after a view: %+v (found=%v)", seen, ok)
	}
	// ...and only that reader: the flag is viewer-relative, like a post's isSaved.
	if story, _ := storyByID(storiesFor(t, writer), created["storyId"]); story.Viewed {
		t.Fatalf("one reader's view turned the writer's ring: %+v", story)
	}

	// The author, and only the author, is offered the list of who opened it: the flag above
	// records a view, and this reads the views back to the one account entitled to them.
	viewersPath := "/api/v1/stories/" + strconv.Itoa(created["storyId"]) + "/viewers"
	viewers := decoded[[]models.StoryViewer](t, writer.call("GET", viewersPath, nil, 200))
	if len(viewers) != 1 || viewers[0].UserID != "alex-id" || viewers[0].Nickname == "" {
		t.Fatalf("the author's seen-by list = %+v, want the one reader", viewers)
	}
	// A reader gets the same 404 as a story that does not exist, so the route is not a way to
	// learn that someone else's story exists.
	reader.call("GET", viewersPath, nil, 404)
	reader.call("GET", "/api/v1/stories/999999/viewers", nil, 404)

	// Opening it twice is a state, not a change: still a 200, still one row.
	reader.call("POST", viewPath, nil, 200)
	var rows int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM storyView WHERE storyId=? AND userId=?", created["storyId"], "alex-id").Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 1 {
		t.Fatalf("viewing the same story twice left %d rows, want 1", rows)
	}

	// A story that does not exist cannot be marked.
	reader.call("POST", "/api/v1/stories/999999/view", nil, 404)

	// Neither can an expired one, and it is gone from the listing as well.
	writer.call("POST", "/api/v1/stories", map[string]string{
		"content": "Gone", "mediaType": "text", "backgroundColor": "#4f46e5",
	}, 201)
	var expired int
	if err := repo.Conn.QueryRow("SELECT MAX(storyId) FROM story").Scan(&expired); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Conn.Exec("UPDATE story SET expiresAt=datetime('now','-1 second') WHERE storyId=?", expired); err != nil {
		t.Fatal(err)
	}
	reader.call("POST", "/api/v1/stories/"+strconv.Itoa(expired)+"/view", nil, 404)
	if _, ok := storyByID(storiesFor(t, reader), expired); ok {
		t.Fatalf("an expired story is still listed: %d", expired)
	}

	// Deleting the writer's story takes the reader's view with it, rather than leaving a
	// row that the next story to reuse the id would inherit.
	writer.call("DELETE", "/api/v1/stories/"+strconv.Itoa(created["storyId"]), nil, 200)
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM storyView WHERE storyId=?", created["storyId"]).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 0 {
		t.Fatalf("deleting the story left %d of its views behind", rows)
	}
}
