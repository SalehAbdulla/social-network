package main

import (
	"strconv"
	"testing"

	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/comment"
	"social-network/backend/pkg/payload/posts"
)

// TestUnreachableObjectsAreNotFound is the audit's one answer, asserted for every object type
// the API addresses by id: a viewer who may not reach a post, a comment under it, a media file
// it carries, a group or anything inside it is answered exactly like a viewer who named an id
// that does not exist — 404, never 403 — so a guessed id cannot confirm the row is there.
func TestUnreachableObjectsAreNotFound(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner, stranger := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	stranger.call("POST", "/api/v1/auth/register", registerValues("No", "Leak", "noleak@example.com"), 201)

	// A followers-only post with a comment and a photo, none of which the stranger follows into.
	post := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Restricted", "content": "Only followers should read this one.", "privacy": "followers",
	}, 201))
	commentDTO := decoded[comment.CommentDTO](t, owner.call("POST", "/api/v1/posts/comments", map[string]any{
		"postId": post.PostId, "content": "A comment under the restricted post",
	}, 201))
	mediaID := "123e4567-e89b-12d3-a456-426614174777"
	addOwnedMedia(t, repo, "dummy-id", mediaID)
	owner.call("PUT", "/api/v1/posts/"+strconv.Itoa(post.PostId), map[string]any{
		"title": "Restricted", "content": "Only followers should read this one.", "privacy": "followers",
		"imageUrls": []string{"/api/v1/media/" + mediaID},
	}, 200)

	id := strconv.Itoa(post.PostId)
	// The owner can read what they wrote; the stranger is answered 404 on every one of them.
	owner.call("GET", "/api/v1/post?id="+id, nil, 200)
	stranger.call("GET", "/api/v1/post?id="+id, nil, 404)
	stranger.call("GET", "/api/v1/posts/comments?postId="+id, nil, 404)
	stranger.call("POST", "/api/v1/posts/comments", map[string]any{"postId": post.PostId, "content": "not for you"}, 404)
	stranger.call("GET", "/api/v1/media/"+mediaID, nil, 404)
	// A reaction inherits the post's visibility too.
	stranger.call("POST", "/api/v1/reactions", map[string]any{"entityType": "post", "entityId": post.PostId, "score": 1}, 404)
	stranger.call("POST", "/api/v1/reactions", map[string]any{"entityType": "comment", "entityId": commentDTO.CommentId, "score": 1}, 404)

	// A group and a post inside it: the stranger is not a member, so the group's content and its
	// member list are 404 for them and 200 for the owner.
	group := decoded[models.Group](t, owner.call("POST", "/api/v1/groups", map[string]string{
		"title": "Members only", "description": "Nothing here for outsiders",
	}, 201))
	base := "/api/v1/groups/" + strconv.Itoa(group.GroupID)
	owner.call("POST", base+"/content/posts", map[string]string{"content": "A post inside the group"}, 201)
	owner.call("GET", base+"/content/posts", nil, 200)
	stranger.call("GET", base+"/content/posts", nil, 404)
	stranger.call("GET", base+"/members", nil, 404)
	stranger.call("POST", base+"/content/posts", map[string]string{"content": "let me in"}, 404)
}
