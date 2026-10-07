package main

import (
	"testing"

	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/posts"
)

// insightsPath is the author-only route under test. Its id is the post's public UUID.
func insightsPath(postID string) string { return "/api/v1/posts/" + postID + "/insights" }

// insightsFor reads a post's insights as its author, the only account allowed to.
func insightsFor(t *testing.T, client integrationClient, postID string) posts.PostInsightsDTO {
	t.Helper()
	return decoded[posts.PostInsightsDTO](t, client.call("GET", insightsPath(postID), nil, 200))
}

// newPostForInsights writes one post and returns its id, so each case reads numbers off a post
// nothing else has touched.
func newPostForInsights(t *testing.T, client integrationClient, privacy string, selected []string) string {
	t.Helper()
	body := map[string]any{"title": "Insights", "content": "A post whose numbers are about to be read.", "privacy": privacy}
	if selected != nil {
		body["selectedFollowerIds"] = selected
	}
	return decoded[posts.PostDTO](t, client.call("POST", "/api/v1/posts", body, 201)).PostId
}

// TestPostInsightsIntegration pins the author's own view of a post: the audience its rule
// actually admits, what the post has drawn, and how those reactions fall across the days they
// arrived. It also pins the two refusals that let the route carry numbers which are not
// viewer-relative: a reader who is not the author is answered 403, and a post the caller may
// not open at all is answered the same 404 a read gives.
func TestPostInsightsIntegration(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	author, reader := newIntegrationClient(t, server), newIntegrationClient(t, server)
	authorUser := decoded[models.SocialUser](t, author.login("dummy@example.com"))
	reader.login("alex@example.com")

	postID := newPostForInsights(t, author, "public", nil)

	// A post nobody has touched reaches everyone (both seeded accounts are public) and reports
	// zeroes rather than omitting the fields, so a client never has to tell "none" from "not
	// loaded" — and the days list is empty rather than absent.
	fresh := insightsFor(t, author, postID)
	if fresh.Reach.Audience != "everyone" || fresh.Reach.Count != 2 {
		t.Fatalf("a public post by a public profile reaches %+v, want everyone/2", fresh.Reach)
	}
	if fresh.Reactions != 0 || fresh.Up != 0 || fresh.Down != 0 || fresh.Comments != 0 || len(fresh.Days) != 0 {
		t.Fatalf("a fresh post reports activity it does not have: %+v", fresh)
	}

	// The author is the only account that may ask, and an unknown post is answered with the 404
	// a read gives rather than a distinct "no insights", so the path confirms nothing.
	reader.call("GET", insightsPath(postID), nil, 403)
	author.call("GET", insightsPath("00000000-0000-4000-8000-000000000000"), nil, 404)

	// One reaction, then a change of heart. The table keeps one row per account, so the total
	// follows the row rather than counting the second write as a second reaction.
	reader.call("POST", "/api/v1/reactions", map[string]any{"entityType": "post", "entityId": postID, "score": 1}, 200)
	if liked := insightsFor(t, author, postID); liked.Reactions != 1 || liked.Up != 1 || liked.Down != 0 {
		t.Fatalf("one upvote reads as %+v, want 1/1/0", liked)
	}
	reader.call("POST", "/api/v1/reactions", map[string]any{"entityType": "post", "entityId": postID, "score": -1}, 200)
	if changed := insightsFor(t, author, postID); changed.Reactions != 1 || changed.Up != 0 || changed.Down != 1 {
		t.Fatalf("a changed vote reads as %+v, want 1/0/1", changed)
	}

	// A second account, backdated to another day: the grouping is by the day a row was written,
	// and the row is moved with SQL here because a test cannot wait for midnight.
	author.call("POST", "/api/v1/reactions", map[string]any{"entityType": "post", "entityId": postID, "score": 1}, 200)
	if _, err := repo.Conn.Exec(
		"UPDATE reaction SET createdAt = ? WHERE userId = ? AND entityType = 'post' AND entityId = (SELECT postId FROM post WHERE publicId = ?)",
		"2026-10-01 09:00:00", "alex-id", postID,
	); err != nil {
		t.Fatal(err)
	}
	grouped := insightsFor(t, author, postID)
	if grouped.Reactions != 2 || grouped.Up != 1 || grouped.Down != 1 {
		t.Fatalf("two accounts read as %+v, want 2/1/1", grouped)
	}
	if len(grouped.Days) != 2 {
		t.Fatalf("two days of reactions grouped into %d: %+v", len(grouped.Days), grouped.Days)
	}
	if grouped.Days[0].Day != "2026-10-01" || grouped.Days[0].Total != 1 || grouped.Days[0].Down != 1 {
		t.Fatalf("the older day reads as %+v, want 2026-10-01/1/0/1", grouped.Days[0])
	}

	// Comments come from the post's own counter, so the number agrees with what the card shows.
	reader.call("POST", "/api/v1/posts/comments", map[string]any{"postId": postID, "content": "A comment the insights should count.", "imageUrls": []string{}}, 201)
	if count := insightsFor(t, author, postID).Comments; count != 1 {
		t.Fatalf("comments read as %d, want 1", count)
	}

	// The audience is the *rule*, not the label: `followers` reaches the author's followers
	// however public the profile is, and it grows as they are gained.
	followerPost := newPostForInsights(t, author, "followers", nil)
	if got := insightsFor(t, author, followerPost).Reach; got.Audience != "followers" || got.Count != 0 {
		t.Fatalf("a followers-only post reaches %+v before anyone follows, want followers/0", got)
	}
	reader.call("PUT", "/api/v1/users/"+authorUser.UserID+"/follow", nil, 200)
	if got := insightsFor(t, author, followerPost).Reach; got.Audience != "followers" || got.Count != 1 {
		t.Fatalf("a followers-only post reaches %+v with one follower, want followers/1", got)
	}

	// `selected` counts the grant rather than the follower list: the audience is who was picked.
	selectedPost := newPostForInsights(t, author, "selected", []string{"alex-id"})
	if got := insightsFor(t, author, selectedPost).Reach; got.Audience != "selected" || got.Count != 1 {
		t.Fatalf("a selected post reaches %+v, want selected/1", got)
	}

	// A public post written by a private profile reaches followers, not everyone — the same
	// narrowing `postVisibility` applies to every read of it.
	own := profileFor(t, author, authorUser.UserID)
	own.IsPublic = false
	author.call("PUT", "/api/v1/users/me", own, 200)
	if got := insightsFor(t, author, postID).Reach; got.Audience != "followers" || got.Count != 1 {
		t.Fatalf("a public post by a private profile reaches %+v, want followers/1", got)
	}
}
