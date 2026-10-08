package main

import (
	"net/url"
	"strconv"
	"testing"

	"social-network/backend/pkg/payload/posts"
)

func searchPage(t *testing.T, client integrationClient, query string, page, size int) posts.PostResponse {
	t.Helper()
	path := "/api/v1/posts/search?q=" + url.QueryEscape(query) +
		"&page=" + strconv.Itoa(page) + "&size=" + strconv.Itoa(size)
	return decoded[posts.PostResponse](t, client.call("GET", path, nil, 200))
}

func TestPostSearchIntegration(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	owner, stranger := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	stranger.login("alex@example.com")

	inTitle := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Cormorant", "content": "A post whose title carries the term.", "privacy": "public",
	}, 201))
	inBody := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Birdwatching", "content": "This body mentions a cormorant and nothing else.", "privacy": "public",
	}, 201))

	for _, query := range []string{"cormorant", "Cormorant", "CORMORANT"} {
		found := searchPage(t, stranger, query, 1, 10)
		if !hasPost(found, inTitle.PostId) || !hasPost(found, inBody.PostId) {
			t.Fatalf("searching %q must return both matching posts: %+v", query, found.Posts)
		}
	}

	first := searchPage(t, stranger, "cormorant", 1, 1)
	if first.TotalElements != 2 || first.TotalPages != 2 || first.LastPage || len(first.Posts) != 1 {
		t.Fatalf("the first page of one is wrong: %+v", first)
	}
	if second := searchPage(t, stranger, "cormorant", 2, 1); !second.LastPage || len(second.Posts) != 1 {
		t.Fatalf("the second page of one is wrong: %+v", second)
	}

	if none := searchPage(t, stranger, "pterodactyl", 1, 10); len(none.Posts) != 0 || none.TotalElements != 0 {
		t.Fatalf("a term nothing matches returned rows: %+v", none)
	}

	hidden := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Pelican", "content": "Only followers may read about this pelican.", "privacy": "followers",
	}, 201))
	if found := searchPage(t, stranger, "pelican", 1, 10); hasPost(found, hidden.PostId) {
		t.Fatalf("a search returned a post the viewer may not read: %+v", found.Posts)
	}
	if found := searchPage(t, owner, "pelican", 1, 10); !hasPost(found, hidden.PostId) {
		t.Fatalf("the author's own search missed a visible post: %+v", found.Posts)
	}

	decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Sale", "content": "Everything is 100% off for a cormorant enthusiast.", "privacy": "public",
	}, 201))
	if percent := searchPage(t, stranger, "%", 1, 10); percent.TotalElements != 1 {
		t.Fatalf("a %% in the box must be literal, got %d rows", percent.TotalElements)
	}
	if underscore := searchPage(t, stranger, "_", 1, 10); underscore.TotalElements != 0 {
		t.Fatalf("a _ in the box must be literal, got %d rows", underscore.TotalElements)
	}

	stranger.call("GET", "/api/v1/posts/search?q=", nil, 400)
	stranger.call("GET", "/api/v1/posts/search?q=%20%20", nil, 400)
	stranger.call("GET", "/api/v1/posts/search?q=cormorant&size=0", nil, 400)
}
