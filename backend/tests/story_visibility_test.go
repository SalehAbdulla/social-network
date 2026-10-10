package tests

import "testing"

func TestStoryVisibilityReadPaths(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	owner, chosen := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	chosen.login("alex@example.com")
	chosen.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200)

	strangerClient := newIntegrationClient(t, server)
	stranger := decoded[map[string]string](t, strangerClient.call("POST", "/api/v1/auth/register", registerValues("Late", "Story", "late-story@example.com"), 201))

	selected := decoded[map[string]int](t, owner.call("POST", "/api/v1/stories", map[string]any{
		"content": "Only the follower I picked", "mediaType": "text", "backgroundColor": "#4f46e5",
		"privacy": "selected", "selectedFollowerIds": []string{"alex-id"},
	}, 201))
	if _, ok := storyByID(storiesFor(t, chosen), selected["storyId"]); !ok {
		t.Fatal("the chosen follower cannot see a selected story")
	}
	if _, ok := storyByID(storiesFor(t, strangerClient), selected["storyId"]); ok {
		t.Fatal("a stranger sees a selected story")
	}

	followers := decoded[map[string]int](t, owner.call("POST", "/api/v1/stories", map[string]any{
		"content": "Followers only", "mediaType": "text", "backgroundColor": "#4f46e5", "privacy": "followers",
	}, 201))
	if _, ok := storyByID(storiesFor(t, chosen), followers["storyId"]); !ok {
		t.Fatal("a follower cannot see a followers story")
	}
	if _, ok := storyByID(storiesFor(t, strangerClient), followers["storyId"]); ok {
		t.Fatal("a stranger sees a followers story")
	}

	public := decoded[map[string]int](t, owner.call("POST", "/api/v1/stories", map[string]any{
		"content": "Public", "mediaType": "text", "backgroundColor": "#4f46e5", "privacy": "public",
	}, 201))
	if _, ok := storyByID(storiesFor(t, strangerClient), public["storyId"]); !ok {
		t.Fatal("a reader cannot see a public story")
	}

	for _, id := range []int{selected["storyId"], followers["storyId"], public["storyId"]} {
		if _, ok := storyByID(storiesFor(t, owner), id); !ok {
			t.Fatalf("the author lost their own story %d", id)
		}
	}

	owner.call("POST", "/api/v1/stories", map[string]any{
		"content": "Bad privacy", "mediaType": "text", "backgroundColor": "#4f46e5", "privacy": "friends",
	}, 400)
	owner.call("POST", "/api/v1/stories", map[string]any{
		"content": "No audience", "mediaType": "text", "backgroundColor": "#4f46e5", "privacy": "selected",
	}, 400)
	owner.call("POST", "/api/v1/stories", map[string]any{
		"content": "Wrong audience", "mediaType": "text", "backgroundColor": "#4f46e5", "privacy": "public",
		"selectedFollowerIds": []string{"alex-id"},
	}, 400)
	owner.call("POST", "/api/v1/stories", map[string]any{
		"content": "Not a follower", "mediaType": "text", "backgroundColor": "#4f46e5", "privacy": "selected",
		"selectedFollowerIds": []string{stranger["userId"]},
	}, 400)
}
