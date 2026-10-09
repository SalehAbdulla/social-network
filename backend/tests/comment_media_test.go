package tests

import (
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/comment"
	"social-network/backend/pkg/payload/posts"
	"social-network/backend/pkg/web"
)

func TestCommentMediaIntegration(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	dummy, alex := newIntegrationClient(t, server), newIntegrationClient(t, server)
	dummy.login("dummy@example.com")
	alex.login("alex@example.com")
	guest := newIntegrationClient(t, server)
	registerMediaGuest(t, guest)

	commenterMedia := []string{"123e4567-e89b-12d3-a456-426614174201", "123e4567-e89b-12d3-a456-426614174202"}
	commenterImages := []string{}
	for _, id := range commenterMedia {
		commenterImages = append(commenterImages, "/api/v1/media/"+id)
		if err := repo.AddMedia(id, "alex-id", "image/png"); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(web.App.UploadDir, id), []byte("png"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := repo.AddMedia("123e4567-e89b-12d3-a456-426614174203", "dummy-id", "image/png"); err != nil {
		t.Fatal(err)
	}

	post := decoded[posts.PostDTO](t, dummy.call("POST", "/api/v1/posts", map[string]any{
		"title": "Comment media post", "content": "Comments on this post can carry a photo.", "privacy": "followers",
	}, 201))
	commentsPath := "/api/v1/posts/comments?postId=" + post.PostId
	commenterImage := commenterImages[0]

	newIntegrationClient(t, server).call("POST", "/api/v1/posts/comments", map[string]any{"postId": post.PostId, "content": "Anonymous comment"}, 401)
	alex.call("POST", "/api/v1/posts/comments", map[string]any{
		"postId": post.PostId, "content": "Photo owned by someone else", "imageUrls": []string{"/api/v1/media/123e4567-e89b-12d3-a456-426614174203"},
	}, 403)
	for name, payload := range map[string]map[string]any{
		"foreign url":     {"postId": post.PostId, "content": "External photo", "imageUrls": []string{"https://example.com/photo.png"}},
		"too many photos": {"postId": post.PostId, "content": "Five photos", "imageUrls": []string{commenterImage, commenterImage, commenterImage, commenterImage, commenterImage}},
		"empty url":       {"postId": post.PostId, "content": "Blank photo slot", "imageUrls": []string{""}},
		"short content":   {"postId": post.PostId, "content": "ab", "imageUrls": []string{commenterImage}},
		"long content":    {"postId": post.PostId, "content": strings.Repeat("x", 301), "imageUrls": []string{commenterImage}},
		"missing postId":  {"content": "No post id", "imageUrls": []string{commenterImage}},
	} {
		t.Run(name, func(t *testing.T) {
			alex.call("POST", "/api/v1/posts/comments", payload, 400)
		})
	}

	hidden := decoded[posts.PostDTO](t, guest.call("POST", "/api/v1/posts", map[string]any{
		"title": "Hidden post", "content": "Only the author's followers may comment.", "privacy": "followers",
	}, 201))
	alex.call("POST", "/api/v1/posts/comments", map[string]any{
		"postId": hidden.PostId, "content": "Peeking at a hidden post", "imageUrls": []string{commenterImage},
	}, 404)

	alex.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200)

	created := decoded[comment.CommentDTO](t, alex.call("POST", "/api/v1/posts/comments", map[string]any{
		"postId": post.PostId, "content": "Two photos and some emoji 🎉", "imageUrls": commenterImages,
	}, 201))
	if len(created.ImageURLs) != 2 || created.ImageURLs[0] != commenterImage || created.CommentText != "Two photos and some emoji 🎉" {
		t.Fatalf("comment media was not stored: %+v", created)
	}
	if created.UserId != "alex-id" {
		t.Fatalf("comment lost its author: %+v", created)
	}
	if created.Nickname != "alexdemo" {
		t.Fatalf("comment lost its author's nickname: %+v", created)
	}
	var stored string
	if err := repo.Conn.QueryRow("SELECT imageUrls FROM comment WHERE commentId = ?", created.CommentId).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	var storedImages []string
	if err := json.Unmarshal([]byte(stored), &storedImages); err != nil || len(storedImages) != 2 {
		t.Fatalf("comment row does not hold a JSON gallery: %q (%v)", stored, err)
	}

	listed := decoded[comment.CommentResponse](t, alex.call("GET", commentsPath, nil, 200))
	found := false
	for _, item := range listed.Comments {
		if item.CommentId == created.CommentId {
			found = true
			if len(item.ImageURLs) != 2 {
				t.Fatalf("listed comment lost its photos: %+v", item)
			}
		}
	}
	if !found {
		t.Fatalf("created comment missing from the list: %+v", listed.Comments)
	}

	alex.call("PUT", "/api/v1/posts/comments/"+strconv.Itoa(created.CommentId), map[string]string{"content": "Edited emoji 🎉🏝"}, 200)
	listed = decoded[comment.CommentResponse](t, alex.call("GET", commentsPath, nil, 200))
	for _, item := range listed.Comments {
		if item.CommentId == created.CommentId && (item.CommentText != "Edited emoji 🎉🏝" || len(item.ImageURLs) != 2) {
			t.Fatalf("editing a comment disturbed its media: %+v", item)
		}
	}

	alex.call("GET", commenterImage, nil, 200)
	dummy.call("GET", commenterImage, nil, 200)
	guest.call("GET", "/api/v1/post?id="+post.PostId, nil, 404)
	guest.call("GET", commenterImage, nil, 404)
	guest.call("GET", "/api/v1/users/alex-id/media", nil, 200)

	media := decoded[[]models.MediaItem](t, alex.call("GET", "/api/v1/users/alex-id/media", nil, 200))
	if len(media) != 2 || media[0].Url != commenterImage || media[0].PostId != post.PostId {
		t.Fatalf("profile media does not list the comment photo: %+v", media)
	}

	alexProfile := decoded[models.SocialUser](t, alex.call("GET", "/api/v1/users/me", nil, 200))
	alexProfile.IsPublic = false
	alex.call("PUT", "/api/v1/users/me", alexProfile, 200)
	guest.call("GET", "/api/v1/users/alex-id/media", nil, 404)
	alexProfile.IsPublic = true
	alex.call("PUT", "/api/v1/users/me", alexProfile, 200)

	alex.call("DELETE", "/api/v1/posts/comments?id="+strconv.Itoa(created.CommentId), nil, 200)
	dummy.call("GET", commenterImage, nil, 404)
	alex.call("GET", commenterImage, nil, 200)

	legacy := decoded[comment.CommentDTO](t, alex.call("POST", "/api/v1/posts/comments", url.Values{
		"postId": {post.PostId}, "content": {"A form encoded comment"},
	}, 201))
	if len(legacy.ImageURLs) != 0 || legacy.CommentText != "A form encoded comment" {
		t.Fatalf("legacy form comment broke: %+v", legacy)
	}
}

func registerMediaGuest(t *testing.T, guest integrationClient) {
	t.Helper()
	guest.call("POST", "/api/v1/auth/register", url.Values{
		"nickName": {"mediaguest"}, "email": {"mediaguest@example.com"}, "firstName": {"Media"},
		"lastName": {"Guest"}, "password": {"MediaGuest123!"}, "confirmPassword": {"MediaGuest123!"},
		"birthDate": {"2000-01-01"}, "gender": {"male"},
	}, 201)
}
