package main

import (
	"net/url"
	"testing"

	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/posts"
)

// hashtagPage runs one call to the hashtag results page and decodes it.
func hashtagPage(t *testing.T, client integrationClient, tag string) posts.PostResponse {
	t.Helper()
	return decoded[posts.PostResponse](t, client.call("GET", "/api/v1/hashtags/"+url.PathEscape(tag)+"?page=1&size=10", nil, 200))
}

// TestHashtagPageIntegration covers the page a `#tag` link opens. Hashtags have no table
// and no write path, so what is asserted is the matching rule itself — which occurrences
// of a tag count, and which posts a viewer is allowed to find with one.
func TestHashtagPageIntegration(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	owner, stranger := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	stranger.login("alex@example.com")

	inBody := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Trip notes", "content": "A weekend away. #reboottrip was the plan.", "privacy": "public",
	}, 201))
	inTitle := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "#reboottrip in the title", "content": "The tag is in the title of this one.", "privacy": "public",
	}, 201))

	found := hashtagPage(t, stranger, "reboottrip")
	if !hasPost(found, inBody.PostId) || !hasPost(found, inTitle.PostId) {
		t.Fatalf("the tag page must find a tag in the body and in the title: %+v", found.Posts)
	}

	// The tag is matched whole: a longer word that merely starts with it is not it, and
	// neither is a tag glued to the end of a word with no separator before the `#`.
	decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Longer", "content": "This mentions #reboottrips and #reboottrip_extra.", "privacy": "public",
	}, 201))
	decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Glued", "content": "The word greed#reboottrip should not count as a tag.", "privacy": "public",
	}, 201))
	if found := hashtagPage(t, stranger, "reboottrip"); found.TotalElements != 2 {
		t.Fatalf("only the whole tag may match, got %d posts: %+v", found.TotalElements, found.Posts)
	}

	// The match ignores case, because the body and the tag are compared lowercased — so
	// the same page answers for the way the tag was written and the way it was typed.
	if found := hashtagPage(t, stranger, "ReBootTrip"); found.TotalElements != 2 {
		t.Fatalf("the tag match must ignore case, got %d posts", found.TotalElements)
	}

	// A tag nothing carries is an empty page rather than an error.
	if none := hashtagPage(t, stranger, "nothingcarriesthis"); len(none.Posts) != 0 || none.TotalElements != 0 {
		t.Fatalf("a tag nothing carries returned rows: %+v", none)
	}

	// The visibility rule is the feed's: a followers-only post is not findable through
	// its tag by a stranger, and is findable by the author.
	hidden := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Private plan", "content": "Only followers see #secretplan for now.", "privacy": "followers",
	}, 201))
	if found := hashtagPage(t, stranger, "secretplan"); hasPost(found, hidden.PostId) {
		t.Fatalf("a tag page returned a post the viewer may not read: %+v", found.Posts)
	}
	if found := hashtagPage(t, owner, "secretplan"); !hasPost(found, hidden.PostId) {
		t.Fatalf("the author's own tag page missed a visible post: %+v", found.Posts)
	}

	// A tag that is not a tag is refused before any query — that is what keeps the tag
	// out of the pattern the repository builds.
	stranger.call("GET", "/api/v1/hashtags/not%20a%20tag", nil, 400)
	stranger.call("GET", "/api/v1/hashtags/caf%C3%A9", nil, 400)
}

// TestNicknameLookupIntegration covers the route a `@handle` link opens.
func TestNicknameLookupIntegration(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	reader := newIntegrationClient(t, server)
	reader.login("alex@example.com")

	// The comparison ignores case on both sides: a mention is written the way the writer
	// remembered the handle, not necessarily the way it was registered.
	profile := decoded[models.SocialUser](t, reader.call("GET", "/api/v1/handles/DummyUser", nil, 200))
	if profile.UserID != "dummy-id" || profile.Nickname != "dummyuser" {
		t.Fatalf("the handle did not resolve to its account: %+v", profile)
	}

	// An unknown handle is a 404, so the mention page can say so instead of rendering an
	// empty profile.
	reader.call("GET", "/api/v1/handles/nobody-at-all", nil, 404)

	// The masking is the profile route's, not a second copy of it: a private profile
	// fetched through its handle is as empty as one fetched by id.
	owner := newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	me := decoded[models.SocialUser](t, owner.call("GET", "/api/v1/users/me", nil, 200))
	me.IsPublic = false
	owner.call("PUT", "/api/v1/users/me", me, 200)
	byHandle := decoded[models.SocialUser](t, reader.call("GET", "/api/v1/handles/dummyuser", nil, 200))
	if byHandle.FirstName != "" || byHandle.Bio != "" || len(byHandle.Followers) != 0 {
		t.Fatalf("a private profile must be masked through the handle route too: %+v", byHandle)
	}
}
