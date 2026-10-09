package tests

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/message"
	"social-network/backend/pkg/payload/posts"
	"testing"
	"time"
)

func TestGroupManagementAndChatNames(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner, member := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	member.login("alex@example.com")
	owner.call("POST", "/api/v1/dev/session", map[string]string{}, 404)
	users := decoded[[]message.ChatUserDTO](t, owner.call("GET", "/api/v1/messages/users", nil, 200))
	if len(users) != 0 {
		t.Fatalf("users without messages appeared in inbox: %+v", users)
	}
	owner.call("POST", "/api/v1/messages", map[string]string{"recipientId": "alex-id", "text": "Hello Alex"}, 201)
	users = decoded[[]message.ChatUserDTO](t, owner.call("GET", "/api/v1/messages/users", nil, 200))
	if len(users) != 1 || users[0].FirstName != "Alex" || users[0].LastName != "User" {
		t.Fatalf("chat names missing: %+v", users)
	}
	group := decoded[models.Group](t, owner.call("POST", "/api/v1/groups", map[string]string{"title": "Managed group", "description": "Original"}, 201))
	base := fmt.Sprintf("/api/v1/groups/%d", group.GroupID)
	member.call("PUT", base, map[string]string{"title": "Hijacked"}, 403)
	member.call("DELETE", base, nil, 403)
	owner.call("POST", base+"/invite/alex-id", nil, 200)
	invites := decoded[[]models.GroupInvitation](t, member.call("GET", "/api/v1/groups/invitations", nil, 200))
	member.call("PUT", fmt.Sprintf("%s/invitations/%d", base, invites[0].InvitationID), map[string]string{"status": "accepted"}, 200)
	const mediaID = "123e4567-e89b-12d3-a456-426614174333"
	if err := repo.AddMedia(mediaID, "dummy-id", "image/png"); err != nil {
		t.Fatal(err)
	}
	imageURL := "/api/v1/media/" + mediaID
	updated := decoded[models.Group](t, owner.call("PUT", base, map[string]string{"title": "Renamed group", "description": "Updated", "imageUrl": imageURL}, 200))
	if updated.ImageURL != imageURL || updated.Description != "Updated" {
		t.Fatalf("details not saved: %+v", updated)
	}
	photo := decoded[models.GroupContent](t, owner.call("POST", base+"/content/posts", map[string]string{"mediaUrl": imageURL}, 201))
	media := decoded[[]models.GroupContent](t, member.call("GET", base+"/content/media", nil, 200))
	if len(media) != 1 || media[0].ID != photo.ID {
		t.Fatal("missing shared photo")
	}
	photoPath := fmt.Sprintf("%s/content/posts/%d", base, photo.ID)
	member.call("PUT", photoPath, map[string]string{"content": "Hijacked"}, 403)
	member.call("DELETE", photoPath, nil, 403)
	owner.call("PUT", photoPath, map[string]string{"content": "Caption changed", "mediaUrl": imageURL}, 200)
	event := decoded[models.GroupContent](t, member.call("POST", base+"/content/events", map[string]string{"title": "Meetup", "content": "Tomorrow", "startsAt": time.Now().Add(time.Hour).Format(time.RFC3339)}, 201))
	member.call("POST", base+"/content/messages", map[string]string{"content": "Hello group"}, 201)
	timeline := decoded[[]models.GroupContent](t, owner.call("GET", base+"/content/timeline", nil, 200))
	if len(timeline) != 2 || timeline[0].FirstName != "Alex" || timeline[1].Kind != "events" {
		t.Fatalf("bad chat timeline: %+v", timeline)
	}
	owner.call("PUT", base+"/members/alex-id", map[string]string{"role": "owner"}, 200)
	owner.call("DELETE", base, nil, 403)
	member.call("DELETE", base+"/members/alex-id", nil, 400)
	member.call("DELETE", base+"/members/dummy-id", nil, 200)
	owner.call("GET", base+"/content/media", nil, 404)
	owner.call("POST", base+"/content/messages", map[string]string{"content": "Forbidden"}, 404)
	member.call("DELETE", photoPath, nil, 200)
	member.call("DELETE", fmt.Sprintf("%s/content/events/%d", base, event.ID), nil, 200)
	member.call("DELETE", base, nil, 200)
	member.call("GET", base, nil, 404)
	var count int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM groupContent WHERE groupId=?", group.GroupID).Scan(&count); err != nil || count != 0 {
		t.Fatal("group content did not cascade", err, count)
	}
}

func TestOptionalPostTitleAndRejectedUploads(t *testing.T) {
	server, _ := integrationServer(t, false, false)
	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")
	post := decoded[posts.PostDTO](t, client.call("POST", "/api/v1/posts", map[string]string{"content": "A post without a title."}, 201))
	if post.Title != "" {
		t.Fatal("title should remain empty")
	}
	client.call("PUT", fmt.Sprintf("/api/v1/posts/%s", post.PostId), map[string]string{"title": "", "content": "Still without a title."}, 200)
	for _, fixture := range []struct {
		name   string
		data   []byte
		status int
	}{
		{"renamed.jpg", []byte("%PDF-1.7\nNot an image"), 400},
		{"broken.png", []byte("\x89PNG\r\n\x1a\ninvalid"), 400},
		{"empty.jpg", nil, 400},
		{"oversized.gif", append([]byte("GIF89a"), make([]byte, 10<<20)...), 413},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			var body bytes.Buffer
			writer := multipart.NewWriter(&body)
			part, err := writer.CreateFormFile("file", fixture.name)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = part.Write(fixture.data); err != nil {
				t.Fatal(err)
			}
			writer.Close()
			req, _ := http.NewRequest("POST", server.URL+"/api/v1/media", &body)
			req.Header.Set("Content-Type", writer.FormDataContentType())
			response, err := client.client.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			data, _ := io.ReadAll(response.Body)
			if response.StatusCode != fixture.status {
				t.Fatalf("expected %d for %s, got %d: %s", fixture.status, fixture.name, response.StatusCode, data)
			}
			var envelope map[string]any
			if json.Unmarshal(data, &envelope) != nil {
				t.Fatal("expected JSON validation response")
			}
		})
	}
}
