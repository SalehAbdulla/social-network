package tests

import (
	"fmt"
	"net/http"
	"net/url"
	"testing"

	"social-network/backend/pkg/app/service"
	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/posts"
	"social-network/backend/pkg/payload/reaction"
)

func TestGroupPostReactions(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner, member := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	member.login("alex@example.com")

	if err := repo.InsertUser(models.Registration{
		UserID: "carol-id", Nickname: "caroldemo", FirstName: "Carol", LastName: "Demo",
		Email: "carol@example.com", PasswordHash: "hash", BirthDate: "2000-01-01", BirthYear: 2000,
		Gender: "female", IsPublic: true,
	}); err != nil {
		t.Fatal(err)
	}
	service.DefaultSessionManager.CreateSession("carol-id", "carol-token")
	serverURL, _ := url.Parse(server.URL)
	outsider := newIntegrationClient(t, server)
	outsider.client.Jar.SetCookies(serverURL, []*http.Cookie{{Name: "session_token", Value: "carol-token", Path: "/"}})

	group := decoded[models.Group](t, owner.call("POST", "/api/v1/groups", map[string]string{"title": "Reactions group"}, 201))
	base := fmt.Sprintf("/api/v1/groups/%d", group.GroupID)
	owner.call("POST", base+"/invite/alex-id", nil, 200)
	invites := decoded[[]models.GroupInvitation](t, member.call("GET", "/api/v1/groups/invitations", nil, 200))
	if len(invites) != 1 {
		t.Fatalf("expected one invitation, got %d", len(invites))
	}
	member.call("PUT", fmt.Sprintf("%s/invitations/%d", base, invites[0].InvitationID), map[string]string{"status": "accepted"}, 200)

	post := decoded[models.GroupContent](t, owner.call("POST", base+"/content/posts", map[string]string{"content": "Like me"}, 201))
	comment := decoded[models.GroupContent](t, member.call("POST", fmt.Sprintf("%s/content/comments?parentId=%d", base, post.ID), map[string]string{"content": "Nice one"}, 201))

	like := func(c integrationClient, entityType string, id any) int {
		c.t.Helper()
		return decoded[reaction.ReactionResponse](t, c.call("POST", "/api/v1/reactions",
			map[string]any{"entityType": entityType, "entityId": id, "score": 1}, 200)).TotalScore
	}
	postList := func(c integrationClient) []models.GroupContent {
		c.t.Helper()
		return decoded[[]models.GroupContent](t, c.call("GET", base+"/content/posts", nil, 200))
	}
	commentList := func(c integrationClient) []models.GroupContent {
		c.t.Helper()
		return decoded[[]models.GroupContent](t, c.call("GET", fmt.Sprintf("%s/content/comments?parentId=%d", base, post.ID), nil, 200))
	}

	outsider.call("POST", "/api/v1/reactions", map[string]any{"entityType": "group_post", "entityId": post.ID, "score": 1}, 404)
	outsider.call("POST", "/api/v1/reactions", map[string]any{"entityType": "group_comment", "entityId": comment.ID, "score": 1}, 404)
	member.call("POST", "/api/v1/reactions", map[string]any{"entityType": "group_post", "entityId": comment.ID, "score": 1}, 404)
	member.call("POST", "/api/v1/reactions", map[string]any{"entityType": "group_comment", "entityId": post.ID, "score": 1}, 404)
	member.call("POST", "/api/v1/reactions", map[string]any{"entityType": "group_post", "entityId": 999999, "score": 1}, 404)
	member.call("POST", "/api/v1/reactions", map[string]any{"entityType": "group_event", "entityId": post.ID, "score": 1}, 400)

	if total := like(member, "group_post", post.ID); total != 1 {
		t.Fatalf("expected a total of 1 after the first like, got %d", total)
	}
	postPage := postList(member)
	if len(postPage) != 1 || postPage[0].LikeCount != 1 || !postPage[0].LikedByMe {
		t.Fatalf("member's view of the page is wrong: %+v", postPage)
	}
	if authorPage := postList(owner); len(authorPage) != 1 || authorPage[0].LikeCount != 1 || authorPage[0].LikedByMe {
		t.Fatalf("author's view of the page is wrong: %+v", authorPage)
	}

	if total := like(member, "group_post", post.ID); total != 0 {
		t.Fatalf("expected a total of 0 after un-liking, got %d", total)
	}
	if unliked := postList(member); len(unliked) != 1 || unliked[0].LikeCount != 0 || unliked[0].LikedByMe {
		t.Fatalf("un-liked page is wrong: %+v", unliked)
	}
	if total := like(member, "group_post", post.ID); total != 1 {
		t.Fatalf("expected the like to come back, got %d", total)
	}

	if total := like(owner, "group_comment", comment.ID); total != 1 {
		t.Fatalf("expected a comment total of 1, got %d", total)
	}
	comments := commentList(member)
	if len(comments) != 1 || comments[0].LikeCount != 1 || comments[0].LikedByMe {
		t.Fatalf("comment page is wrong for the reader who did not like it: %+v", comments)
	}
	if comments := commentList(owner); len(comments) != 1 || !comments[0].LikedByMe {
		t.Fatalf("comment page is wrong for the reader who liked it: %+v", comments)
	}
	if afterComment := postList(member); afterComment[0].LikeCount != 1 {
		t.Fatalf("post total drifted to %d", afterComment[0].LikeCount)
	}

	feedPost := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{"title": "Feed post", "content": "A feed post that is unchanged by this work.", "privacy": "public"}, 201))
	if total := like(member, "post", feedPost.PostId); total != 1 {
		t.Fatalf("expected the feed's like to still work, got %d", total)
	}
	feedComment := decoded[struct {
		CommentID int `json:"commentId"`
	}](t, member.call("POST", "/api/v1/posts/comments", url.Values{"postId": {fmt.Sprint(feedPost.PostId)}, "content": {"A feed comment"}}, 201))
	if total := like(member, "comment", feedComment.CommentID); total != 1 {
		t.Fatalf("expected the feed's comment like to still work, got %d", total)
	}

	owner.call("DELETE", fmt.Sprintf("%s/content/posts/%d?parentId=0", base, post.ID), nil, 200)
	var remaining int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM reaction WHERE entityType = 'group_post' AND entityId = ?", post.ID).Scan(&remaining); err != nil {
		t.Fatal(err)
	}
	if remaining != 0 {
		t.Fatalf("expected the deleted post's reactions to be gone, %d left", remaining)
	}
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM reaction WHERE entityType = 'post' AND entityId = (SELECT postId FROM post WHERE publicId = ?)", feedPost.PostId).Scan(&remaining); err != nil {
		t.Fatal(err)
	}
	if remaining != 1 {
		t.Fatalf("the feed's reaction was swept up by a group delete: %d left", remaining)
	}
}
