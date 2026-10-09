package tests

import (
	"testing"

	"social-network/backend/pkg/models"
)

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
	if got := byID["dave-id"].Mutuals; len(got) != 1 || got[0] != "Alex User" {
		t.Fatalf("dave's mutual names = %v, want [Alex User]", got)
	}

	newIntegrationClient(t, server).call("GET", "/api/v1/users/suggestions", nil, 401)
	viewer.call("GET", "/api/v1/users/suggestions?limit=0", nil, 400)
}
