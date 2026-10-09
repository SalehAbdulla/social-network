package tests

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"social-network/backend/pkg/payload/notification"
	"social-network/backend/pkg/payload/posts"
	"social-network/backend/pkg/web"
)

func TestPostEditingIntegration(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner, follower, guest := newIntegrationClient(t, server), newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	follower.login("alex@example.com")
	original := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Original post", "content": "This is the original content.", "privacy": "public",
	}, 201))
	if original.FirstName != "Dummy" || original.LastName != "User" {
		t.Fatalf("a created post must carry its author's name, got %q %q", original.FirstName, original.LastName)
	}
	editURL := "/api/v1/posts/" + original.PostId
	readURL := "/api/v1/post?id=" + original.PostId
	input := map[string]any{"title": "Updated post", "content": "This is the updated content.", "privacy": "public", "imageUrls": []string{}}
	guest.call("PUT", editURL, input, 401)
	follower.call("PUT", editURL, input, 403)
	owner.call("PUT", "/api/v1/posts/0", input, 400)
	owner.call("PUT", "/api/v1/posts/00000000-0000-4000-8000-000000000000", input, 404)
	follower.call("POST", "/api/v1/posts/comments", url.Values{"postId": {original.PostId}, "content": {"Keep this comment when editing"}}, 201)
	follower.call("POST", "/api/v1/reactions", map[string]any{"entityType": "post", "entityId": original.PostId, "score": 1}, 200)
	if _, err := repo.Conn.Exec("UPDATE post SET updatedAt='2000-01-01 00:00:00' WHERE postId=?", original.PostId); err != nil {
		t.Fatal(err)
	}
	updated := decoded[posts.PostDTO](t, owner.call("PUT", editURL, input, 200))
	if updated.Title != "Updated post" || updated.Content != input["content"] || updated.PostId != original.PostId || updated.CreatedAt != original.CreatedAt || updated.UpdatedAt == "2000-01-01 00:00:00" {
		t.Fatalf("edit was not persisted: %+v", updated)
	}
	if updated.Score != 1 || updated.CommentsCounter != 1 {
		t.Fatalf("edit lost interactions: %+v", updated)
	}
	input["privacy"] = "selected"
	input["selectedFollowerIds"] = []string{"alex-id"}
	owner.call("PUT", editURL, input, 400)
	follower.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200)
	mediaID := "123e4567-e89b-12d3-a456-426614174111"
	if err := repo.AddMedia(mediaID, "dummy-id", "image/png"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(web.App.UploadDir, mediaID), []byte("png"), 0600); err != nil {
		t.Fatal(err)
	}
	input["imageUrls"] = []string{"/api/v1/media/" + mediaID}
	selected := decoded[posts.PostDTO](t, owner.call("PUT", editURL, input, 200))
	if selected.Privacy != "selected" || len(selected.SelectedUsers) != 1 || selected.SelectedUsers[0] != "alex-id" || len(selected.ImageURLs) != 1 {
		t.Fatalf("lost audience or photo: %+v", selected)
	}
	follower.call("GET", readURL, nil, 200)
	follower.call("GET", "/api/v1/media/"+mediaID, nil, 200)
	for name, value := range map[string]any{"title": "x", "content": strings.Repeat("x", 501), "privacy": "unknown", "selectedFollowerIds": []string{}, "imageUrls": []string{"https://example.com/not-owned.png"}} {
		bad := map[string]any{}
		for key, current := range input {
			bad[key] = current
		}
		bad[name] = value
		owner.call("PUT", editURL, bad, 400)
	}
	stored := decoded[posts.PostDTO](t, owner.call("GET", readURL, nil, 200))
	if stored.Title != selected.Title || stored.Content != selected.Content || len(stored.SelectedUsers) != 1 || len(stored.ImageURLs) != 1 {
		t.Fatalf("invalid update mutated post: %+v", stored)
	}
	if _, err := repo.Conn.Exec("CREATE TRIGGER reject_test_audience BEFORE INSERT ON post_selected_follower BEGIN SELECT RAISE(ABORT, 'test audience failure'); END"); err != nil {
		t.Fatal(err)
	}
	input["title"] = "Must roll back"
	owner.call("PUT", editURL, input, 500)
	if _, err := repo.Conn.Exec("DROP TRIGGER reject_test_audience"); err != nil {
		t.Fatal(err)
	}
	stored = decoded[posts.PostDTO](t, owner.call("GET", readURL, nil, 200))
	if stored.Title != selected.Title || len(stored.SelectedUsers) != 1 {
		t.Fatalf("partial edit committed: %+v", stored)
	}
	input["title"], input["privacy"], input["selectedFollowerIds"], input["imageUrls"] = "Public again", "public", []string{}, []string{}
	cleared := decoded[posts.PostDTO](t, owner.call("PUT", editURL, input, 200))
	if len(cleared.SelectedUsers) != 0 || len(cleared.ImageURLs) != 0 {
		t.Fatalf("old audience or photo retained: %+v", cleared)
	}
	follower.call("GET", "/api/v1/media/"+mediaID, nil, 404)
	input["privacy"] = "followers"
	owner.call("PUT", editURL, input, 200)
	follower.call("DELETE", "/api/v1/users/dummy-id/follow", nil, 200)
	follower.call("GET", readURL, nil, 404)
}

func TestLegacyConnectionNotificationsAreHidden(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	user := newIntegrationClient(t, server)
	user.login("dummy@example.com")
	if _, err := repo.CreateNotification("dummy-id", "alex-id", "connection", 0); err != nil {
		t.Fatal(err)
	}
	alerts := decoded[notification.NotificationResponse](t, user.call("GET", "/api/v1/notifications", nil, 200))
	count := decoded[map[string]int](t, user.call("GET", "/api/v1/notifications/unread-count", nil, 200))
	if len(alerts.Notifications) != 0 || alerts.TotalElements != 0 || count["count"] != 0 {
		t.Fatal("removed connection notifications must not appear in the list or badge")
	}
}
