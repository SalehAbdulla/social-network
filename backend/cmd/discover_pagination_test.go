package main

import (
	"fmt"
	"net/http"
	"testing"

	"social-network/backend/pkg/models"
)

func TestDiscoverPaginationContract(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	viewer := newIntegrationClient(t, server)
	viewer.login("dummy@example.com")

	for i := 0; i < 7; i++ {
		if err := repo.InsertUser(models.Registration{
			UserID:       fmt.Sprintf("discover-%d-id", i),
			Nickname:     fmt.Sprintf("discover%02d", i),
			FirstName:    fmt.Sprintf("Person%d", i),
			LastName:     "Discover",
			Email:        fmt.Sprintf("discover-%d@example.com", i),
			PasswordHash: "hash",
			BirthDate:    "2000-01-01",
			BirthYear:    2000,
			Gender:       "other",
			IsPublic:     true,
		}); err != nil {
			t.Fatal(err)
		}
	}

	everyone := decoded[[]models.SocialUser](t, viewer.call("GET", "/api/v1/users?size=100&offset=0", nil, 200))
	if len(everyone) < 8 {
		t.Fatalf("expected the seeded pair plus the seven inserted accounts, got %d", len(everyone))
	}

	// The size is the LIMIT on the server and the step of the offset on the client.
	// If the two disagree the walk silently skips rows, so every account has to come
	// back exactly once.
	const size = 3
	seen := map[string]bool{}
	for offset, pages := 0, 0; ; offset, pages = offset+size, pages+1 {
		page := decoded[[]models.SocialUser](t, viewer.call("GET", fmt.Sprintf("/api/v1/users?size=%d&offset=%d", size, offset), nil, 200))
		if len(page) > size {
			t.Fatalf("the page at offset %d returned %d rows for size %d", offset, len(page), size)
		}
		for _, user := range page {
			if seen[user.UserID] {
				t.Fatalf("%s came back on more than one page", user.UserID)
			}
			seen[user.UserID] = true
		}
		if len(page) < size {
			break
		}
		if pages > len(everyone) {
			t.Fatal("paging did not terminate")
		}
	}
	if len(seen) != len(everyone) {
		t.Fatalf("walking with size=%d saw %d of %d accounts", size, len(seen), len(everyone))
	}
	for _, user := range everyone {
		if !seen[user.UserID] {
			t.Fatalf("%s was skipped by the walk", user.UserID)
		}
	}

	for _, bad := range []string{"0", "-1", "101", "abc"} {
		viewer.call("GET", "/api/v1/users?size="+bad, nil, http.StatusBadRequest)
	}

	// A client that asks for no size keeps the default page.
	if defaulted := decoded[[]models.SocialUser](t, viewer.call("GET", "/api/v1/users", nil, 200)); len(defaulted) != len(everyone) {
		t.Fatalf("the default page returned %d accounts, want %d", len(defaulted), len(everyone))
	}
}
