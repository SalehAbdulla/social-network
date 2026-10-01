package main

import (
	"strconv"
	"testing"

	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/posts"
)

// savedList reads one page of the caller's bookmark list.
func savedList(t *testing.T, client integrationClient, query string) posts.PostResponse {
	t.Helper()
	return decoded[posts.PostResponse](t, client.call("GET", "/api/v1/saved-posts"+query, nil, 200))
}

// hasPost reports whether a post id is present in a list response.
func hasPost(list posts.PostResponse, postID int) bool {
	for _, item := range list.Posts {
		if item.PostId == postID {
			return true
		}
	}
	return false
}

// feedPost returns the entry for one post out of the first feed page, so a test
// can read the viewer-relative `isSaved` flag the card draws.
func feedPost(t *testing.T, client integrationClient, postID int) (posts.PostDTO, bool) {
	t.Helper()
	feed := decoded[posts.PostResponse](t, client.call("GET", "/api/v1/posts?page=1&size=20", nil, 200))
	for _, item := range feed.Posts {
		if item.PostId == postID {
			return item, true
		}
	}
	return posts.PostDTO{}, false
}

// TestSavedPostsIntegration walks the bookmark lifecycle and the flags that go
// with it. The endpoints are idempotent by design, so "save twice" and "unsave
// twice" are states rather than errors, and the flag has to agree on all three
// surfaces that show a post: the feed, the single post and the saved list.
func TestSavedPostsIntegration(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner, reader := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	reader.login("alex@example.com")

	post := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Save me", "content": "A post the reader will bookmark.", "privacy": "public",
	}, 201))
	savePath := "/api/v1/posts/" + strconv.Itoa(post.PostId) + "/save"

	if list := savedList(t, reader, "?page=1&size=10"); len(list.Posts) != 0 {
		t.Fatalf("a fresh account already has saved posts: %+v", list.Posts)
	}

	// Save it. The answer names the resulting state, not a change.
	saved := decoded[map[string]any](t, reader.call("POST", savePath, nil, 200))
	if saved["saved"] != true || saved["postId"] != float64(post.PostId) {
		t.Fatalf("unexpected save answer: %+v", saved)
	}

	list := savedList(t, reader, "?page=1&size=10")
	if !hasPost(list, post.PostId) || list.TotalElements != 1 || len(list.Posts) != 1 {
		t.Fatalf("the saved list is wrong after one save: %+v", list)
	}
	if !list.Posts[0].IsSaved {
		t.Fatalf("a post in the saved list is not marked isSaved: %+v", list.Posts[0])
	}

	// Every read surface agrees for the saver, and the owner — who saved
	// nothing — is not told otherwise.
	if item, ok := feedPost(t, reader, post.PostId); !ok || !item.IsSaved {
		t.Fatalf("the reader's feed does not mark the post saved: %+v", item)
	}
	if item, ok := feedPost(t, owner, post.PostId); !ok || item.IsSaved {
		t.Fatalf("the owner's feed marks a post saved that they never saved: %+v", item)
	}
	if single := decoded[posts.PostDTO](t, reader.call("GET", "/api/v1/post?id="+strconv.Itoa(post.PostId), nil, 200)); !single.IsSaved {
		t.Fatalf("the single-post view does not mark the post saved: %+v", single)
	}

	// Saving twice is one row, not a duplicate and not an error.
	reader.call("POST", savePath, nil, 200)
	if list := savedList(t, reader, "?page=1&size=10"); list.TotalElements != 1 {
		t.Fatalf("a second save duplicated the bookmark: %+v", list)
	}

	// Un-saving is idempotent too, and the flag follows.
	reader.call("DELETE", savePath, nil, 200)
	if list := savedList(t, reader, "?page=1&size=10"); len(list.Posts) != 0 {
		t.Fatalf("un-saving left the post in the list: %+v", list.Posts)
	}
	reader.call("DELETE", savePath, nil, 200)
	if item, ok := feedPost(t, reader, post.PostId); !ok || item.IsSaved {
		t.Fatalf("the feed still marks the post saved after un-saving: %+v", item)
	}

	// A deleted post takes its bookmark with it: the row cascades, which is why
	// the list query carries no orphan filter of its own.
	reader.call("POST", savePath, nil, 200)
	owner.call("DELETE", "/api/v1/posts?id="+strconv.Itoa(post.PostId), nil, 200)
	if remaining, err := repo.IsPostSaved("alex-id", post.PostId); err != nil || remaining {
		t.Fatalf("deleting a post left its bookmark behind (saved=%v, err=%v)", remaining, err)
	}
	if list := savedList(t, reader, "?page=1&size=10"); hasPost(list, post.PostId) {
		t.Fatalf("a deleted post is still in the saved list: %+v", list.Posts)
	}
}

// TestSavedPostsRespectPostVisibility pins that bookmarks are not a way around
// the post-visibility rule. A post the viewer cannot read cannot be saved (404,
// the same answer a read gives, so a save cannot probe for posts), and a post
// that stops being readable drops out of the list instead of lingering in it.
func TestSavedPostsRespectPostVisibility(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	owner, stranger := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	stranger.login("alex@example.com")

	followersOnly := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "For followers", "content": "Only followers of the author may read this.",
		"privacy": "followers",
	}, 201))
	stranger.call("POST", "/api/v1/posts/"+strconv.Itoa(followersOnly.PostId)+"/save", nil, 404)

	// A public post the stranger can save...
	public := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Public for now", "content": "Readable until the author turns private.",
		"privacy": "public",
	}, 201))
	stranger.call("POST", "/api/v1/posts/"+strconv.Itoa(public.PostId)+"/save", nil, 200)
	if list := savedList(t, stranger, "?page=1&size=10"); !hasPost(list, public.PostId) {
		t.Fatalf("a saved public post is missing from the list: %+v", list.Posts)
	}

	// ...and stops counting once the author's profile goes private, because the
	// list runs the same visibility fragment the feed does.
	profile := decoded[models.SocialUser](t, owner.call("GET", "/api/v1/users/me", nil, 200))
	profile.IsPublic = false
	owner.call("PUT", "/api/v1/users/me", profile, 200)
	if list := savedList(t, stranger, "?page=1&size=10"); hasPost(list, public.PostId) {
		t.Fatalf("a post hidden by a private profile is still in the saved list: %+v", list.Posts)
	}

	// Bad ids are refused before any query; a post that does not exist is a 404
	// rather than a bookmark pointing at nothing.
	stranger.call("POST", "/api/v1/posts/0/save", nil, 400)
	stranger.call("POST", "/api/v1/posts/999999/save", nil, 404)
	stranger.call("DELETE", "/api/v1/posts/nonsense/save", nil, 400)
}
