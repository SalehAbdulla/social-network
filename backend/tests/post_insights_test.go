package tests

import (
	"testing"

	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/posts"
)

func insightsPath(postID string) string { return "/api/v1/posts/" + postID + "/insights" }

func insightsFor(t *testing.T, client integrationClient, postID string) posts.PostInsightsDTO {
	t.Helper()
	return decoded[posts.PostInsightsDTO](t, client.call("GET", insightsPath(postID), nil, 200))
}

func newPostForInsights(t *testing.T, client integrationClient, privacy string, selected []string) string {
	t.Helper()
	body := map[string]any{"title": "Insights", "content": "A post whose numbers are about to be read.", "privacy": privacy}
	if selected != nil {
		body["selectedFollowerIds"] = selected
	}
	return decoded[posts.PostDTO](t, client.call("POST", "/api/v1/posts", body, 201)).PostId
}

func TestPostInsightsIntegration(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	author, reader := newIntegrationClient(t, server), newIntegrationClient(t, server)
	authorUser := decoded[models.SocialUser](t, author.login("dummy@example.com"))
	reader.login("alex@example.com")

	postID := newPostForInsights(t, author, "public", nil)

	fresh := insightsFor(t, author, postID)
	if fresh.Reach.Audience != "everyone" || fresh.Reach.Count != 2 {
		t.Fatalf("a public post by a public profile reaches %+v, want everyone/2", fresh.Reach)
	}
	if fresh.Reactions != 0 || fresh.Up != 0 || fresh.Down != 0 || fresh.Comments != 0 || len(fresh.Days) != 0 {
		t.Fatalf("a fresh post reports activity it does not have: %+v", fresh)
	}

	reader.call("GET", insightsPath(postID), nil, 403)
	author.call("GET", insightsPath("00000000-0000-4000-8000-000000000000"), nil, 404)

	reader.call("POST", "/api/v1/reactions", map[string]any{"entityType": "post", "entityId": postID, "score": 1}, 200)
	if liked := insightsFor(t, author, postID); liked.Reactions != 1 || liked.Up != 1 || liked.Down != 0 {
		t.Fatalf("one upvote reads as %+v, want 1/1/0", liked)
	}
	reader.call("POST", "/api/v1/reactions", map[string]any{"entityType": "post", "entityId": postID, "score": -1}, 200)
	if changed := insightsFor(t, author, postID); changed.Reactions != 1 || changed.Up != 0 || changed.Down != 1 {
		t.Fatalf("a changed vote reads as %+v, want 1/0/1", changed)
	}

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

	reader.call("POST", "/api/v1/posts/comments", map[string]any{"postId": postID, "content": "A comment the insights should count.", "imageUrls": []string{}}, 201)
	if count := insightsFor(t, author, postID).Comments; count != 1 {
		t.Fatalf("comments read as %d, want 1", count)
	}

	followerPost := newPostForInsights(t, author, "followers", nil)
	if got := insightsFor(t, author, followerPost).Reach; got.Audience != "followers" || got.Count != 0 {
		t.Fatalf("a followers-only post reaches %+v before anyone follows, want followers/0", got)
	}
	reader.call("PUT", "/api/v1/users/"+authorUser.UserID+"/follow", nil, 200)
	if got := insightsFor(t, author, followerPost).Reach; got.Audience != "followers" || got.Count != 1 {
		t.Fatalf("a followers-only post reaches %+v with one follower, want followers/1", got)
	}

	selectedPost := newPostForInsights(t, author, "selected", []string{"alex-id"})
	if got := insightsFor(t, author, selectedPost).Reach; got.Audience != "selected" || got.Count != 1 {
		t.Fatalf("a selected post reaches %+v, want selected/1", got)
	}

	own := profileFor(t, author, authorUser.UserID)
	own.IsPublic = false
	author.call("PUT", "/api/v1/users/me", own, 200)
	if got := insightsFor(t, author, postID).Reach; got.Audience != "followers" || got.Count != 1 {
		t.Fatalf("a public post by a private profile reaches %+v, want followers/1", got)
	}
}
