package main

import (
	"testing"

	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/posts"
)

// profileFor reads one member's profile as a given client sees it.
func profileFor(t *testing.T, client integrationClient, userID string) models.SocialUser {
	t.Helper()
	return decoded[models.SocialUser](t, client.call("GET", "/api/v1/users/"+userID, nil, 200))
}

// TestProfilePostCountIntegration pins the number on the profile header: it is the count of
// the posts the *viewer* may read, through the same fragment the posts list runs, so the
// header and the page under it can never disagree — and a private profile does not leak how
// much activity it has to someone who may not read it.
func TestProfilePostCountIntegration(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	owner, reader := newIntegrationClient(t, server), newIntegrationClient(t, server)
	ownerUser := decoded[models.SocialUser](t, owner.login("dummy@example.com"))
	reader.login("alex@example.com")

	// A brand new account has nothing to count.
	if count := profileFor(t, owner, ownerUser.UserID).PostCount; count != 0 {
		t.Fatalf("a fresh profile counts %d posts, want 0", count)
	}

	for _, privacy := range []string{"public", "public", "followers"} {
		owner.call("POST", "/api/v1/posts", map[string]any{
			"title": "Counted", "content": "A post the header should count.", "privacy": privacy,
		}, 201)
	}

	// The owner sees their own three posts.
	if count := profileFor(t, owner, ownerUser.UserID).PostCount; count != 3 {
		t.Fatalf("the owner's header counts %d posts, want 3", count)
	}
	// The reader follows nobody, so only the two public posts are theirs to read — and that
	// is what the header says on the profile they are looking at.
	if count := profileFor(t, reader, ownerUser.UserID).PostCount; count != 2 {
		t.Fatalf("a non-follower's view counts %d posts, want 2", count)
	}

	// Making the profile private hides the posts themselves, so the count goes to zero with
	// them: a header that still said "2" would be advertising posts the page will not show.
	own := profileFor(t, owner, ownerUser.UserID)
	own.IsPublic = false
	owner.call("PUT", "/api/v1/users/me", own, 200)
	if count := profileFor(t, reader, ownerUser.UserID).PostCount; count != 0 {
		t.Fatalf("a private profile's header counts %d posts to a non-follower, want 0", count)
	}
	// The owner still sees their own number: the count is masked for the viewer who may not
	// read the profile, not for the profile's owner.
	if count := profileFor(t, owner, ownerUser.UserID).PostCount; count != 3 {
		t.Fatalf("the owner's own count changed to %d when the profile went private, want 3", count)
	}

	// Following restores exactly what a follower may read: the two public posts and the one
	// that is followers-only, which is the same fragment the list uses. The profile has to be
	// public for this to be a follow rather than a request — a private profile only records a
	// pending connection, which grants nothing and so counts nothing.
	private := profileFor(t, owner, ownerUser.UserID)
	private.IsPublic = true
	owner.call("PUT", "/api/v1/users/me", private, 200)
	reader.call("PUT", "/api/v1/users/"+ownerUser.UserID+"/follow", nil, 200)
	if count := profileFor(t, reader, ownerUser.UserID).PostCount; count != 3 {
		t.Fatalf("a follower's view counts %d posts, want 3", count)
	}

	// The count is a number on a profile, not a listing: the posts themselves come from the
	// paged endpoint, and this asserts the two agree on the same three posts.
	list := decoded[[]posts.PostDTO](t, reader.call("GET", "/api/v1/users/"+ownerUser.UserID+"/posts?offset=0", nil, 200))
	if len(list) != 3 {
		t.Fatalf("the posts list shows %d posts where the header counts 3", len(list))
	}
}
