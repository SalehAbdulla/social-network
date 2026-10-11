package tests

import (
	"net/http"
	"testing"

	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/posts"
)

// Every post carries its author's avatar, so a post header can draw the face the
// author uploaded instead of their initials — including in the feed, which has no
// other way to look a member up.
// The media endpoint serves an access-controlled file, so it must not let a cache
// keep it: the browser of a shared machine was serving a followers-only photo to
// the second account out of the first one's cache.
func TestMediaIsNotCached(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	owner := newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	avatar := uploadAvatar(t, server, owner)

	request, err := http.NewRequest("GET", server.URL+avatar, nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := owner.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("the owner could not read their own upload: %d", response.StatusCode)
	}
	if got := response.Header.Get("Cache-Control"); got != "private, no-store" {
		t.Fatalf("an access-controlled upload answered Cache-Control: %q", got)
	}
}

func TestPostCarriesItsAuthorsAvatar(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	owner, viewer := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	viewer.login("alex@example.com")

	avatar := uploadAvatar(t, server, owner)
	profile := decoded[models.SocialUser](t, owner.call("GET", "/api/v1/users/me", nil, 200))
	profile.Avatar = avatar
	owner.call("PUT", "/api/v1/users/me", profile, 200)

	created := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "A post with a face", "content": "The header can draw the author now.", "privacy": "public",
	}, 201))
	if created.Avatar != avatar {
		t.Fatalf("the created post lost its author's avatar: %+v", created)
	}

	feed := decoded[posts.PostResponse](t, viewer.call("GET", "/api/v1/posts?size=30&sortBy=createdat&sortOrder=desc", nil, 200))
	found := false
	for _, post := range feed.Posts {
		if post.PostId != created.PostId {
			continue
		}
		found = true
		if post.Avatar != avatar {
			t.Fatalf("the feed post lost its author's avatar: %+v", post)
		}
	}
	if !found {
		t.Fatalf("the created post is missing from the feed: %+v", feed.Posts)
	}

	single := decoded[posts.PostDTO](t, viewer.call("GET", "/api/v1/post?id="+created.PostId, nil, 200))
	if single.Avatar != avatar {
		t.Fatalf("the single post lost its author's avatar: %+v", single)
	}
	if saved := decoded[map[string]any](t, viewer.call("POST", "/api/v1/posts/"+created.PostId+"/save", nil, 200)); saved["saved"] != true {
		t.Fatalf("the post was not saved: %+v", saved)
	}
	bookmarks := decoded[posts.PostResponse](t, viewer.call("GET", "/api/v1/saved-posts?size=30", nil, 200))
	for _, post := range bookmarks.Posts {
		if post.PostId == created.PostId && post.Avatar != avatar {
			t.Fatalf("the saved post lost its author's avatar: %+v", post)
		}
	}
}

// A public post on a private profile still reaches only that profile's followers,
// so the post has to say whether its author is public — otherwise the card shows a
// globe over something that never appears on a public feed.
func TestPostReportsWhetherItsAuthorIsPublic(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	owner, viewer := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	viewer.login("alex@example.com")

	created := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Audience label", "content": "The label follows the author's profile.", "privacy": "public",
	}, 201))
	if !created.AuthorIsPublic {
		t.Fatalf("a public author was not reported as public: %+v", created)
	}
	if seen := decoded[posts.PostDTO](t, viewer.call("GET", "/api/v1/post?id="+created.PostId, nil, 200)); !seen.AuthorIsPublic {
		t.Fatalf("the flag did not survive a read by another member: %+v", seen)
	}

	profile := decoded[models.SocialUser](t, owner.call("GET", "/api/v1/users/me", nil, 200))
	profile.IsPublic = false
	owner.call("PUT", "/api/v1/users/me", profile, 200)
	if after := decoded[posts.PostDTO](t, owner.call("GET", "/api/v1/post?id="+created.PostId, nil, 200)); after.AuthorIsPublic {
		t.Fatalf("the post still claims a public author: %+v", after)
	}
}
