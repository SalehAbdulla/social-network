package tests

import (
	"testing"

	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/posts"
)

func profileFor(t *testing.T, client integrationClient, userID string) models.SocialUser {
	t.Helper()
	return decoded[models.SocialUser](t, client.call("GET", "/api/v1/users/"+userID, nil, 200))
}

func TestProfilePostCountIntegration(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	owner, reader := newIntegrationClient(t, server), newIntegrationClient(t, server)
	ownerUser := decoded[models.SocialUser](t, owner.login("dummy@example.com"))
	reader.login("alex@example.com")

	if count := profileFor(t, owner, ownerUser.UserID).PostCount; count != 0 {
		t.Fatalf("a fresh profile counts %d posts, want 0", count)
	}

	for _, privacy := range []string{"public", "public", "followers"} {
		owner.call("POST", "/api/v1/posts", map[string]any{
			"title": "Counted", "content": "A post the header should count.", "privacy": privacy,
		}, 201)
	}

	if count := profileFor(t, owner, ownerUser.UserID).PostCount; count != 3 {
		t.Fatalf("the owner's header counts %d posts, want 3", count)
	}
	if count := profileFor(t, reader, ownerUser.UserID).PostCount; count != 2 {
		t.Fatalf("a non-follower's view counts %d posts, want 2", count)
	}

	own := profileFor(t, owner, ownerUser.UserID)
	own.IsPublic = false
	owner.call("PUT", "/api/v1/users/me", own, 200)
	if count := profileFor(t, reader, ownerUser.UserID).PostCount; count != 0 {
		t.Fatalf("a private profile's header counts %d posts to a non-follower, want 0", count)
	}
	if count := profileFor(t, owner, ownerUser.UserID).PostCount; count != 3 {
		t.Fatalf("the owner's own count changed to %d when the profile went private, want 3", count)
	}

	private := profileFor(t, owner, ownerUser.UserID)
	private.IsPublic = true
	owner.call("PUT", "/api/v1/users/me", private, 200)
	reader.call("PUT", "/api/v1/users/"+ownerUser.UserID+"/follow", nil, 200)
	if count := profileFor(t, reader, ownerUser.UserID).PostCount; count != 3 {
		t.Fatalf("a follower's view counts %d posts, want 3", count)
	}

	list := decoded[[]posts.PostDTO](t, reader.call("GET", "/api/v1/users/"+ownerUser.UserID+"/posts?offset=0", nil, 200))
	if len(list) != 3 {
		t.Fatalf("the posts list shows %d posts where the header counts 3", len(list))
	}
}
