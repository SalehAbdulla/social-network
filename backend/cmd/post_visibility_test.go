package main

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/comment"
	"social-network/backend/pkg/payload/posts"
)

// addOwnedMedia stores one media row and its file, so a post fixture can attach
// a photo without going through the upload endpoint.
func addOwnedMedia(t *testing.T, repo *repositories.DB, ownerID, mediaID string) {
	t.Helper()
	if err := repo.AddMedia(mediaID, ownerID, "image/png"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(app.UploadDir, mediaID), []byte("png"), 0600); err != nil {
		t.Fatal(err)
	}
}

// TestPostVisibilityReadPaths walks every surface that exposes a post — and the
// two that let a user touch one — as three different viewers. It exists because a
// single SQL fragment backs all of them: a surface that stops using it, or a new
// one that forgets it, is exactly what this file has to fail on.
func TestPostVisibilityReadPaths(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner, follower := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	follower.login("alex@example.com")
	// A third account that has not followed anyone yet: the stranger below, and
	// the late follower further down.
	stranger := newIntegrationClient(t, server)
	stranger.call("POST", "/api/v1/auth/register", registerValues("Late", "Reader", "late@example.com"), 201)

	// "Private" in the spec: only the followers the creator chose.
	follower.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200)
	post := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Chosen audience", "content": "Only the follower I picked should read this.", "privacy": "selected",
		"selectedFollowerIds": []string{"alex-id"},
	}, 201))
	postPath := "/api/v1/post?id=" + strconv.Itoa(post.PostId)
	commentsPath := "/api/v1/posts/comments?postId=" + strconv.Itoa(post.PostId)
	comment := decoded[comment.CommentDTO](t, owner.call("POST", "/api/v1/posts/comments", map[string]any{
		"postId": post.PostId, "content": "A comment only the audience may read",
	}, 201))

	mediaID := "123e4567-e89b-12d3-a456-426614174301"
	addOwnedMedia(t, repo, "dummy-id", mediaID)
	imageURL := "/api/v1/media/" + mediaID
	owner.call("PUT", "/api/v1/posts/"+strconv.Itoa(post.PostId), map[string]any{
		"title": "Chosen audience", "content": "Only the follower I picked should read this.", "privacy": "selected",
		"selectedFollowerIds": []string{"alex-id"}, "imageUrls": []string{imageURL},
	}, 200)

	// The chosen follower reads the post, its photo, its comments, the media grid
	// and reacts to both the post and the comment.
	follower.call("GET", postPath, nil, 200)
	follower.call("GET", imageURL, nil, 200)
	follower.call("GET", commentsPath, nil, 200)
	if score := decoded[map[string]any](t, follower.call("POST", "/api/v1/reactions", map[string]any{"entityType": "post", "entityId": post.PostId, "score": 1}, 200)); score["totalScore"] != float64(1) {
		t.Fatalf("the chosen follower could not react: %+v", score)
	}
	follower.call("POST", "/api/v1/reactions", map[string]any{"entityType": "comment", "entityId": comment.CommentId, "score": 1}, 200)
	followerMedia := decoded[[]models.MediaItem](t, follower.call("GET", "/api/v1/users/dummy-id/media", nil, 200))
	if len(followerMedia) != 1 || followerMedia[0].Url != imageURL {
		t.Fatalf("the chosen follower cannot see the post photo: %+v", followerMedia)
	}

	// A stranger reaches none of it, and reacts to none of it.
	stranger.call("GET", postPath, nil, 404)
	stranger.call("GET", imageURL, nil, 403)
	stranger.call("GET", commentsPath, nil, 404)
	stranger.call("POST", "/api/v1/reactions", map[string]any{"entityType": "post", "entityId": post.PostId, "score": 1}, 404)
	stranger.call("POST", "/api/v1/reactions", map[string]any{"entityType": "comment", "entityId": comment.CommentId, "score": 1}, 404)
	if feed := decoded[posts.PostResponse](t, stranger.call("GET", "/api/v1/posts?page=1&size=20", nil, 200)); len(feed.Posts) != 0 {
		t.Fatalf("a stranger sees a selected post in the feed: %+v", feed.Posts)
	}
	if listed := decoded[[]posts.PostDTO](t, stranger.call("GET", "/api/v1/users/dummy-id/posts", nil, 200)); len(listed) != 0 {
		t.Fatalf("a stranger sees a selected post on the profile: %+v", listed)
	}
	if media := decoded[[]models.MediaItem](t, stranger.call("GET", "/api/v1/users/dummy-id/media", nil, 200)); len(media) != 0 {
		t.Fatalf("a stranger sees the post photo in the profile grid: %+v", media)
	}
	// Reacting to something invisible must not have written anything either.
	var postScore int
	if err := repo.Conn.QueryRow("SELECT score FROM post WHERE postId = ?", post.PostId).Scan(&postScore); err != nil {
		t.Fatal(err)
	}
	if postScore != 1 {
		t.Fatalf("a rejected reaction still changed the post score: %d", postScore)
	}

	// Someone who follows later is not part of the audience the author chose.
	stranger.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200)
	stranger.call("GET", postPath, nil, 404)
	stranger.call("GET", imageURL, nil, 403)
	stranger.call("GET", commentsPath, nil, 404)
	stranger.call("POST", "/api/v1/reactions", map[string]any{"entityType": "post", "entityId": post.PostId, "score": 1}, 404)
	stranger.call("POST", "/api/v1/reactions", map[string]any{"entityType": "comment", "entityId": comment.CommentId, "score": 1}, 404)
	if media := decoded[[]models.MediaItem](t, stranger.call("GET", "/api/v1/users/dummy-id/media", nil, 200)); len(media) != 0 {
		t.Fatalf("a later follower sees the post photo: %+v", media)
	}
	if listed := decoded[[]posts.PostDTO](t, stranger.call("GET", "/api/v1/users/dummy-id/posts", nil, 200)); len(listed) != 0 {
		t.Fatalf("a later follower sees the post on the profile: %+v", listed)
	}
	if feed := decoded[posts.PostResponse](t, stranger.call("GET", "/api/v1/posts?page=1&size=20", nil, 200)); len(feed.Posts) != 0 {
		t.Fatalf("a later follower sees the post in the feed: %+v", feed.Posts)
	}
}

// TestSelectedAudienceIsAGrantNotALiveRelation pins the one question the audit
// could have gone either way on. The spec separates "almost private" (only the
// creator's followers — a live relation) from "private" (only the followers the
// creator chose), so `selected` records the audience chosen when the post was
// written: unfollowing later does not revoke it, a follower who arrives later
// never gains it, and the author's own edit is what rewrites the list.
func TestSelectedAudienceIsAGrantNotALiveRelation(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner, chosen := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	chosen.login("alex@example.com")
	chosen.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200)

	mediaID := "123e4567-e89b-12d3-a456-426614174302"
	addOwnedMedia(t, repo, "dummy-id", mediaID)
	imageURL := "/api/v1/media/" + mediaID
	post := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Grant", "content": "Shared with one follower on purpose.", "privacy": "selected",
		"selectedFollowerIds": []string{"alex-id"}, "imageUrls": []string{imageURL},
	}, 201))
	postPath := "/api/v1/post?id=" + strconv.Itoa(post.PostId)

	// The author cannot record someone who is not a follower yet, which is what
	// makes the recorded list meaningful in the first place.
	lateClient := newIntegrationClient(t, server)
	late := decoded[map[string]string](t, lateClient.call("POST", "/api/v1/auth/register", registerValues("Late", "Grant", "late-grant@example.com"), 201))
	lateClient.call("GET", postPath, nil, 404)
	lateClient.call("GET", imageURL, nil, 403)
	owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Not yet", "content": "This audience member does not follow me.", "privacy": "selected",
		"selectedFollowerIds": []string{late["userId"]},
	}, 400)

	// Unfollowing the author leaves the grant in place, for the post and its photo.
	chosen.call("DELETE", "/api/v1/users/dummy-id/follow", nil, 200)
	chosen.call("GET", postPath, nil, 200)
	chosen.call("GET", imageURL, nil, 200)
	if score := decoded[map[string]any](t, chosen.call("POST", "/api/v1/reactions", map[string]any{"entityType": "post", "entityId": post.PostId, "score": 1}, 200)); score["totalScore"] != float64(1) {
		t.Fatalf("the granted follower lost the post: %+v", score)
	}

	// Editing re-validates the audience against current followers, which is the
	// author's lever: the now-unfollowed member can no longer be kept, and the
	// post is readable by everyone once the author chooses a public audience.
	owner.call("PUT", "/api/v1/posts/"+strconv.Itoa(post.PostId), map[string]any{
		"title": "Grant", "content": "Rewritten audience.", "privacy": "selected",
		"selectedFollowerIds": []string{"alex-id"},
	}, 400)
	owner.call("PUT", "/api/v1/posts/"+strconv.Itoa(post.PostId), map[string]any{
		"title": "Grant", "content": "Now public, like any other post.", "privacy": "public",
		"imageUrls": []string{imageURL},
	}, 200)
	chosen.call("GET", postPath, nil, 200)
	lateClient.call("GET", postPath, nil, 200)
	lateClient.call("GET", imageURL, nil, 200)
}
