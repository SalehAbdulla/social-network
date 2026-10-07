package main

import (
	"testing"

	"social-network/backend/pkg/models"
)

// TestUserSuggestionsIntegration covers the feed's "Suggested for you" endpoint: who it may
// offer, who it must never offer, and the order it offers them in.
//
// The exclusions are the interesting half. A suggestion list is a read path over the whole
// `user` table, so the three refusals — never the viewer, never someone already followed,
// never someone with an outstanding follow request — are what keep it from suggesting an
// action that cannot succeed (following again is a 409).
func TestUserSuggestionsIntegration(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	viewer := newIntegrationClient(t, server)
	viewer.login("dummy@example.com")

	for _, u := range []struct {
		id, email, nick, first string
		public                 bool
	}{
		{"bob-id", "bob@example.com", "bobdemo", "Bob", true},
		{"carol-id", "carol@example.com", "caroldemo", "Carol", true},
		{"dave-id", "dave@example.com", "davedemo", "Dave", true},
		{"eve-id", "eve@example.com", "evedemo", "Eve", false},
	} {
		if err := repo.InsertUser(models.Registration{
			UserID: u.id, Nickname: u.nick, FirstName: u.first, LastName: "Demo",
			Email: u.email, PasswordHash: "hash", BirthDate: "2000-01-01", BirthYear: 2000,
			Gender: "other", IsPublic: u.public,
		}); err != nil {
			t.Fatal(err)
		}
	}

	// The viewer follows alex and carol (both must then be excluded); alex and carol both
	// follow bob, so bob has two mutuals, while alex alone follows dave (one mutual).
	// Following eve — a private profile — leaves a *pending* request, which must also be
	// excluded: offering "Follow" for someone already asked would only produce a 409.
	for _, edge := range [][2]string{
		{"dummy-id", "alex-id"}, {"dummy-id", "carol-id"},
		{"alex-id", "bob-id"}, {"carol-id", "bob-id"},
		{"alex-id", "dave-id"},
		{"dummy-id", "eve-id"},
	} {
		if _, err := repo.FollowUser(edge[0], edge[1]); err != nil {
			t.Fatalf("follow %s->%s: %v", edge[0], edge[1], err)
		}
	}

	rows := decoded[[]map[string]any](t, viewer.call("GET", "/api/v1/users/suggestions?limit=5", nil, 200))
	if len(rows) == 0 {
		t.Fatal("no suggestions returned")
	}
	position := map[string]int{}
	for i, row := range rows {
		position[row["userId"].(string)] = i
		// The endpoint ships only the fields the row draws — never the account's email.
		if _, ok := row["email"]; ok {
			t.Fatalf("a suggestion leaked an email: %+v", row)
		}
	}
	for _, excluded := range []string{"dummy-id", "alex-id", "carol-id", "eve-id"} {
		if _, ok := position[excluded]; ok {
			t.Fatalf("%s must not be offered as a suggestion", excluded)
		}
	}
	if _, ok := position["bob-id"]; !ok {
		t.Fatal("bob — followed by two people the viewer follows — must be suggested")
	}
	if _, ok := position["dave-id"]; !ok {
		t.Fatal("dave must be suggested")
	}
	if position["bob-id"] > position["dave-id"] {
		t.Fatalf("the higher mutual count must rank first: bob=%d dave=%d", position["bob-id"], position["dave-id"])
	}

	suggestions := decoded[[]models.UserSuggestion](t, viewer.call("GET", "/api/v1/users/suggestions?limit=5", nil, 200))
	byID := map[string]models.UserSuggestion{}
	for _, s := range suggestions {
		byID[s.UserID] = s
	}
	if got := byID["bob-id"].MutualCount; got != 2 {
		t.Fatalf("bob's mutual count = %d, want 2", got)
	}
	if got := byID["bob-id"].Mutuals; len(got) != 2 {
		t.Fatalf("bob's mutual names = %v, want two", got)
	}
	// The seeded alex is "Alex User"; the mutual name is the display name, not the handle.
	if got := byID["dave-id"].Mutuals; len(got) != 1 || got[0] != "Alex User" {
		t.Fatalf("dave's mutual names = %v, want [Alex User]", got)
	}

	// An unauthenticated call is refused before any query runs, and a malformed limit is a
	// 400 rather than a silent default.
	newIntegrationClient(t, server).call("GET", "/api/v1/users/suggestions", nil, 401)
	viewer.call("GET", "/api/v1/users/suggestions?limit=0", nil, 400)
}
