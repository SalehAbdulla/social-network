package tests

import (
	"testing"

	"social-network/backend/pkg/payload/posts"
)

// A post body is free text, and a line break is ordinary text — the composer
// writes it with a textarea, so a paragraph break has to survive. Only the
// characters that are not text at all stay out, which is why the same rule
// still turns away a non-ASCII letter.
func TestPostBodyAcceptsLineBreaks(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	author := newIntegrationClient(t, server)
	author.login("dummy@example.com")

	body := "Hello World\n\nHello World\n\nHello World"
	created := decoded[posts.PostDTO](t, author.call("POST", "/api/v1/posts", map[string]any{
		"title": "", "content": body, "privacy": "public",
	}, 201))
	if created.Content != body {
		t.Fatalf("line breaks were not preserved: %q", created.Content)
	}

	author.call("POST", "/api/v1/posts", map[string]any{
		"title": "", "content": "café with an accent", "privacy": "public",
	}, 400)
}
