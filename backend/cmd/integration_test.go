package main

import (
	"bytes"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"social-network/backend/pkg/app/handlers"
	"social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/app/service"
	"social-network/backend/pkg/config"
	sqlitedb "social-network/backend/pkg/db/sqlite"
	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/comment"
	"social-network/backend/pkg/payload/message"
	"social-network/backend/pkg/payload/notification"
	"social-network/backend/pkg/payload/posts"
	ws "social-network/backend/pkg/websocket"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/bcrypt"
)

type integrationClient struct {
	t      *testing.T
	client *http.Client
	base   string
}

func TestPrivateProfilePublicPostVisibility(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	dummy, alex := newIntegrationClient(t, server), newIntegrationClient(t, server)
	dummy.login("dummy@example.com")
	alex.login("alex@example.com")

	post := decoded[posts.PostDTO](t, dummy.call("POST", "/api/v1/posts", map[string]any{
		"title":   "Public profile post",
		"content": "Public posts should not be visible when the profile is private.",
		"privacy": "public",
	}, 201))

	profile := decoded[models.SocialUser](t, dummy.call("GET", "/api/v1/users/me", nil, 200))
	profile.IsPublic = false
	dummy.call("PUT", "/api/v1/users/me", profile, 200)

	alex.call("GET", "/api/v1/post?id="+strconv.Itoa(post.PostId), nil, 404)
	feed := decoded[posts.PostResponse](t, alex.call("GET", "/api/v1/posts?page=1&size=20", nil, 200))
	for _, item := range feed.Posts {
		if item.PostId == post.PostId {
			t.Fatalf("private profile public post is visible in the feed: %+v", item)
		}
	}

	alex.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200)
	alex.call("GET", "/api/v1/post?id="+strconv.Itoa(post.PostId), nil, 404)
	dummy.call("PUT", "/api/v1/follow-requests/alex-id", nil, 200)
	alex.call("GET", "/api/v1/post?id="+strconv.Itoa(post.PostId), nil, 200)
}

func TestPostPrivacyIntegration(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	dummy, alex := newIntegrationClient(t, server), newIntegrationClient(t, server)
	dummy.login("dummy@example.com")
	alex.login("alex@example.com")

	public := decoded[posts.PostDTO](t, dummy.call("POST", "/api/v1/posts", map[string]any{
		"title": "Public privacy post", "content": "Everyone can read this post.", "privacy": "public",
	}, 201))
	if public.Privacy != "public" {
		t.Fatalf("expected public privacy, got %q", public.Privacy)
	}
	alex.call("GET", "/api/v1/post?id="+strconv.Itoa(public.PostId), nil, 200)

	mediaID := "123e4567-e89b-12d3-a456-426614174000"
	if err := repo.AddMedia(mediaID, "dummy-id", "image/png"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(app.UploadDir, mediaID), []byte("png"), 0600); err != nil {
		t.Fatal(err)
	}
	followersOnly := decoded[posts.PostDTO](t, dummy.call("POST", "/api/v1/posts", map[string]any{
		"title": "Followers privacy post", "content": "Only followers can read this post.", "privacy": "followers",
		"imageUrls": []string{"/api/v1/media/" + mediaID},
	}, 201))
	postPath := "/api/v1/post?id=" + strconv.Itoa(followersOnly.PostId)
	alex.call("GET", postPath, nil, 404)
	alex.call("GET", "/api/v1/users/dummy-id/posts", nil, 200)
	alex.call("GET", "/api/v1/posts/comments?postId="+strconv.Itoa(followersOnly.PostId), nil, 404)
	alex.call("GET", "/api/v1/media/"+mediaID, nil, 403)

	alex.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200)
	alex.call("GET", postPath, nil, 200)
	alex.call("GET", "/api/v1/media/"+mediaID, nil, 200)
	alex.call("POST", "/api/v1/posts/comments", url.Values{
		"postId": {strconv.Itoa(followersOnly.PostId)}, "content": {"A visible follower comment"},
	}, 201)

	selected := decoded[posts.PostDTO](t, dummy.call("POST", "/api/v1/posts", map[string]any{
		"title": "Selected privacy post", "content": "Only selected followers can read this post.", "privacy": "selected",
		"selectedFollowerIds": []string{"alex-id"},
	}, 201))
	if len(selected.SelectedUsers) != 1 || selected.SelectedUsers[0] != "alex-id" {
		t.Fatalf("selected audience was not persisted: %+v", selected.SelectedUsers)
	}
	alex.call("GET", "/api/v1/post?id="+strconv.Itoa(selected.PostId), nil, 200)

	if err := repo.InsertUser(models.Registration{
		UserID: "carol-id", Nickname: "caroldemo", FirstName: "Carol", LastName: "Demo",
		Email: "carol@example.com", PasswordHash: "hash", BirthDate: "2000-01-01", BirthYear: 2000,
		Gender: "female", IsPublic: true,
	}); err != nil {
		t.Fatal(err)
	}
	service.DefaultSessionManager.CreateSession("carol-id", "carol-token")
	serverURL, _ := url.Parse(server.URL)
	carol := newIntegrationClient(t, server)
	carol.client.Jar.SetCookies(serverURL, []*http.Cookie{{Name: "session_token", Value: "carol-token", Path: "/"}})
	carol.call("GET", "/api/v1/post?id="+strconv.Itoa(selected.PostId), nil, 404)
}

func (c integrationClient) login(email string) json.RawMessage {
	c.t.Helper()
	c.call("POST", "/api/v1/auth/login", url.Values{"identifier": {email}, "password": {"DummyUser123!"}}, 200)
	return c.call("GET", "/api/v1/users/me", nil, 200)
}

func (c integrationClient) call(method, path string, body any, status int) json.RawMessage {
	c.t.Helper()
	var reader io.Reader
	contentType := "application/json"
	if form, ok := body.(url.Values); ok {
		reader = strings.NewReader(form.Encode())
		contentType = "application/x-www-form-urlencoded"
	} else if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			c.t.Fatal(err)
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequest(method, c.base+path, reader)
	if err != nil {
		c.t.Fatal(err)
	}
	req.Header.Set("Content-Type", contentType)
	response, err := c.client.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer response.Body.Close()
	data, err := io.ReadAll(response.Body)
	if err != nil {
		c.t.Fatal(err)
	}
	if response.StatusCode != status {
		c.t.Fatalf("%s %s: expected %d, got %d: %s", method, path, status, response.StatusCode, data)
	}
	var envelope struct {
		Data json.RawMessage `json:"data"`
	}
	_ = json.Unmarshal(data, &envelope)
	return envelope.Data
}

func decoded[T any](t *testing.T, raw json.RawMessage) T {
	t.Helper()
	var value T
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func integrationServer(t *testing.T, dev, production bool) (*httptest.Server, *repositories.DB) {
	t.Helper()
	database, err := sql.Open("sqlite3", filepath.Join(t.TempDir(), "test.db")+"?_foreign_keys=on&_busy_timeout=5000")
	if err != nil {
		t.Fatal(err)
	}
	database.SetMaxOpenConns(1)
	t.Cleanup(func() { database.Close() })
	if err := sqlitedb.RunMigrations(database); err != nil {
		t.Fatal(err)
	}
	repo := &repositories.DB{Conn: database}
	hash, _ := bcrypt.GenerateFromPassword([]byte("DummyUser123!"), bcrypt.MinCost)
	for _, u := range []struct{ id, email, nick, first string }{{"dummy-id", "dummy@example.com", "dummyuser", "Dummy"}, {"alex-id", "alex@example.com", "alexdemo", "Alex"}} {
		if err := repo.InsertUser(models.Registration{
			UserID: u.id, Nickname: u.nick, FirstName: u.first, LastName: "User", Email: u.email,
			PasswordHash: string(hash), BirthDate: "2000-01-01", BirthYear: 2000, Gender: "male", IsPublic: true,
		}); err != nil {
			t.Fatal(err)
		}
	}
	app = config.AppConfig{Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), InProduction: production, UploadDir: t.TempDir(), FrontendOrigin: "http://localhost:4000"}
	auth := service.NewAuthService(repo)
	reactions := service.NewReactionService(repo)
	hc := handlers.NewHandlerContext(&app, auth, service.NewPostService(repo, reactions), service.NewCommentService(repo), reactions, service.NewMessageService(repo, repo), service.NewNotificationService(repo))
	hc.SocialService = &service.SocialService{Repo: repo}
	hc.GroupService = &service.GroupService{Repo: repo}
	hub := ws.NewHub()
	hc.SetHub(hub)
	go hub.Run()
	t.Cleanup(hub.Stop)
	handlers.SetHandlerContext(hc)
	server := httptest.NewServer(routes())
	t.Cleanup(server.Close)
	return server, repo
}

func newIntegrationClient(t *testing.T, server *httptest.Server) integrationClient {
	jar, _ := cookiejar.New(nil)
	return integrationClient{t: t, client: &http.Client{Jar: jar, Timeout: 5 * time.Second}, base: server.URL}
}

func TestSocialIntegration(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	dummy, alex := newIntegrationClient(t, server), newIntegrationClient(t, server)
	dummy.call("GET", "/api/v1/posts", nil, 401)
	dummy.call("POST", "/api/v1/dev/session", map[string]string{"email": "someone@example.com"}, 404)
	user := decoded[models.SocialUser](t, dummy.login("dummy@example.com"))
	if user.UserID != "dummy-id" {
		t.Fatal("incorrect authenticated account")
	}
	alex.login("alex@example.com")
	// Repeat bootstrap keeps the same valid session and account identity.
	dummy.login("dummy@example.com")
	dummy.call("GET", "/api/v1/auth/me", nil, 200)
	dummy.call("GET", "/api/v1/posts", nil, 200)
	availability := decoded[map[string]bool](t, dummy.call("GET", "/api/v1/auth/nickname-availability?nickname=dummyuser", nil, 200))
	if availability["available"] {
		t.Fatal("existing nickname reported as available")
	}
	availability = decoded[map[string]bool](t, dummy.call("GET", "/api/v1/auth/nickname-availability?nickname=new_user_42", nil, 200))
	if !availability["available"] {
		t.Fatal("unused nickname reported as unavailable")
	}
	dummy.call("POST", "/api/v1/auth/register", url.Values{
		"nickName": {"young_user"}, "email": {"young@example.com"}, "firstName": {"Young"}, "lastName": {"User"},
		"password": {"ValidPassword!123"}, "confirmPassword": {"ValidPassword!123"}, "birthDate": {"2015-01-01"}, "gender": {"male"},
	}, 400)

	t.Run("groups", func(t *testing.T) {
		group := decoded[models.Group](t, dummy.call("POST", "/api/v1/groups", map[string]string{"title": "Integration Group", "description": "A test community"}, 201))
		if !group.IsOwner || group.MemberCount != 1 {
			t.Fatalf("unexpected group owner state: %+v", group)
		}
		groups := decoded[[]models.Group](t, alex.call("GET", "/api/v1/groups?q=Integration", nil, 200))
		if len(groups) != 1 || groups[0].GroupID != group.GroupID || groups[0].IsMember {
			t.Fatalf("unexpected group listing: %+v", groups)
		}
		alex.call("POST", "/api/v1/groups/"+strconv.Itoa(group.GroupID)+"/join", nil, 200)
		pendingGroup := decoded[models.Group](t, alex.call("GET", "/api/v1/groups/"+strconv.Itoa(group.GroupID), nil, 200))
		groups = decoded[[]models.Group](t, alex.call("GET", "/api/v1/groups?q=Integration", nil, 200))
		if !pendingGroup.JoinRequested || !groups[0].JoinRequested || pendingGroup.IsMember {
			t.Fatalf("join request state was not persisted: %+v", pendingGroup)
		}
		ownerGroup := decoded[models.Group](t, dummy.call("GET", "/api/v1/groups/"+strconv.Itoa(group.GroupID), nil, 200))
		if ownerGroup.JoinRequested {
			t.Fatal("another user's request was exposed as the owner's own request")
		}
		alex.call("POST", "/api/v1/groups/"+strconv.Itoa(group.GroupID)+"/join", nil, 200)
		requests := decoded[[]models.GroupRequest](t, dummy.call("GET", "/api/v1/groups/"+strconv.Itoa(group.GroupID)+"/requests", nil, 200))
		if len(requests) != 1 || requests[0].UserID != "alex-id" {
			t.Fatalf("unexpected group requests: %+v", requests)
		}
		dummy.call("PUT", "/api/v1/groups/"+strconv.Itoa(group.GroupID)+"/requests/"+strconv.Itoa(requests[0].RequestID), map[string]string{"status": "accepted"}, 200)
		members := decoded[[]models.GroupMember](t, alex.call("GET", "/api/v1/groups/"+strconv.Itoa(group.GroupID)+"/members", nil, 200))
		if len(members) != 2 {
			t.Fatalf("unexpected group members: %+v", members)
		}
		acceptedGroup := decoded[models.Group](t, alex.call("GET", "/api/v1/groups/"+strconv.Itoa(group.GroupID), nil, 200))
		if acceptedGroup.JoinRequested || !acceptedGroup.IsMember || acceptedGroup.MemberCount != 2 {
			t.Fatalf("accepted request state is incorrect: %+v", acceptedGroup)
		}
	})

	t.Run("group invitations", func(t *testing.T) {
		group := decoded[models.Group](t, dummy.call("POST", "/api/v1/groups", map[string]string{"title": "Invite Group", "description": "Invitation workflow"}, 201))
		dummy.call("POST", "/api/v1/groups/"+strconv.Itoa(group.GroupID)+"/invite/"+"alex-id", nil, 200)
		invites := decoded[[]models.GroupInvitation](t, alex.call("GET", "/api/v1/groups/invitations", nil, 200))
		if len(invites) != 1 || invites[0].GroupID != group.GroupID {
			t.Fatalf("unexpected group invitations: %+v", invites)
		}
		alex.call("PUT", "/api/v1/groups/"+strconv.Itoa(group.GroupID)+"/invitations/"+strconv.Itoa(invites[0].InvitationID), map[string]string{"status": "accepted"}, 200)
		members := decoded[[]models.GroupMember](t, alex.call("GET", "/api/v1/groups/"+strconv.Itoa(group.GroupID)+"/members", nil, 200))
		if len(members) != 2 {
			t.Fatalf("unexpected invited member list: %+v", members)
		}
	})

	t.Run("profiles and follows", func(t *testing.T) {
		privateProfile := decoded[models.SocialUser](t, dummy.call("GET", "/api/v1/users/me", nil, 200))
		privateProfile.IsPublic = false
		dummy.call("PUT", "/api/v1/users/me", privateProfile, 200)
		redacted := decoded[models.SocialUser](t, alex.call("GET", "/api/v1/users/dummy-id", nil, 200))
		if redacted.Bio != "" || len(redacted.Followers) != 0 {
			t.Fatal("private profile exposed details to a non-follower")
		}
		alex.call("GET", "/api/v1/users/dummy-id/posts", nil, 403)
		alex.call("GET", "/api/v1/users/dummy-id/follows", nil, 403)
		alex.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200)
		alex.call("GET", "/api/v1/users/dummy-id/posts", nil, 403)
		dummy.call("PUT", "/api/v1/follow-requests/alex-id", nil, 200)
		visible := decoded[models.SocialUser](t, alex.call("GET", "/api/v1/users/dummy-id", nil, 200))
		if visible.Bio != privateProfile.Bio || len(visible.Followers) != 1 {
			t.Fatal("follower could not view private profile")
		}
		visibleLists := decoded[map[string][]models.SocialUser](t, alex.call("GET", "/api/v1/users/dummy-id/follows", nil, 200))
		if len(visibleLists["followers"]) != 1 || visibleLists["followers"][0].UserID != "alex-id" || len(visibleLists["following"]) != 0 {
			t.Fatalf("follower could not read the lists of the private profile: %+v", visibleLists)
		}
		dummy.call("PUT", "/api/v1/users/alex-id/follow", nil, 200)
		privateProfile.IsPublic = true
		dummy.call("PUT", "/api/v1/users/me", privateProfile, 200)
		users := decoded[[]models.SocialUser](t, dummy.call("GET", "/api/v1/users?q=Alex", nil, 200))
		if len(users) != 1 || users[0].UserID != "alex-id" {
			t.Fatalf("unexpected discovery: %+v", users)
		}
		dummy.call("PUT", "/api/v1/users/dummy-id/follow", nil, 400)
		dummy.call("PUT", "/api/v1/users/alex-id/follow", nil, 409)
		dummy.call("PUT", "/api/v1/users/alex-id/follow", nil, 409)
		profile := decoded[models.SocialUser](t, dummy.call("GET", "/api/v1/users/me", nil, 200))
		if len(profile.Following) != 1 {
			t.Fatal("follow must be idempotent")
		}
		alerts := decoded[notification.NotificationResponse](t, alex.call("GET", "/api/v1/notifications", nil, 200))
		followAlerts := 0
		for _, alert := range alerts.Notifications {
			if alert.EntityType == "follow" {
				followAlerts++
			}
		}
		if followAlerts != 1 {
			t.Fatal("following twice must notify only once")
		}
		follows := decoded[map[string][]models.SocialUser](t, dummy.call("GET", "/api/v1/users/me/follows", nil, 200))
		if len(follows) != 2 || len(follows["followers"]) != 1 || len(follows["following"]) != 1 {
			t.Fatalf("unexpected follow lists: %+v", follows)
		}
		if follows["followers"][0].FirstName != "Alex" {
			t.Fatal("follower list must contain profile details")
		}
		// A private list entry keeps its public identity only, like the profile page.
		privateProfile.IsPublic = false
		dummy.call("PUT", "/api/v1/users/me", privateProfile, 200)
		alex.call("DELETE", "/api/v1/users/dummy-id/follow", nil, 200)
		own := decoded[map[string][]models.SocialUser](t, alex.call("GET", "/api/v1/users/alex-id/follows", nil, 200))
		if len(own["following"]) != 0 || len(own["followers"]) != 1 || own["followers"][0].Nickname != "dummyuser" || own["followers"][0].Bio != "" {
			t.Fatalf("private follow list entry leaked profile details: %+v", own)
		}
		alex.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200)
		privateProfile.IsPublic = true
		dummy.call("PUT", "/api/v1/users/me", privateProfile, 200)
		dummy.call("GET", "/api/v1/follows", nil, 404)
		for _, method := range []string{"GET", "POST", "PUT", "DELETE"} {
			dummy.call(method, "/api/v1/connections/alex-id", nil, 404)
		}
		dummy.call("GET", "/api/v1/connections", nil, 404)
		profileData := decoded[map[string]json.RawMessage](t, dummy.call("GET", "/api/v1/users/me", nil, 200))
		for _, key := range []string{"connections", "pending", "requested"} {
			if _, exists := profileData[key]; exists {
				t.Fatalf("obsolete profile field: %s", key)
			}
		}
		profile.Bio = "Integration profile"
		profile.Location = "Bahrain"
		dummy.call("PUT", "/api/v1/users/me", profile, 200)
		stored, err := repo.SocialProfile("dummy-id")
		if err != nil || stored.Bio != profile.Bio {
			t.Fatal("profile was not persisted", err)
		}
		dummy.call("DELETE", "/api/v1/users/alex-id/follow", nil, 200)
	})

	var mediaURL string
	t.Run("media", func(t *testing.T) {
		png, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=")
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		file, _ := writer.CreateFormFile("file", "avatar.png")
		file.Write(png)
		writer.Close()
		req, _ := http.NewRequest("POST", server.URL+"/api/v1/media", &body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		response, err := dummy.client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		if response.StatusCode != 201 {
			data, _ := io.ReadAll(response.Body)
			t.Fatalf("upload: %d %s", response.StatusCode, data)
		}
		var result struct {
			Data struct {
				URL string `json:"url"`
			} `json:"data"`
		}
		json.NewDecoder(response.Body).Decode(&result)
		mediaURL = result.Data.URL
		imageResponse, err := dummy.client.Get(server.URL + mediaURL)
		if err != nil {
			t.Fatal(err)
		}
		defer imageResponse.Body.Close()
		if imageResponse.StatusCode != 200 || imageResponse.Header.Get("Content-Type") != "image/png" {
			t.Fatal("uploaded media cannot be read")
		}
		user.Avatar = mediaURL
		dummy.call("PUT", "/api/v1/users/me", user, 200)
		other := decoded[models.SocialUser](t, alex.call("GET", "/api/v1/users/me", nil, 200))
		other.Avatar = mediaURL
		alex.call("PUT", "/api/v1/users/me", other, 403)
	})

	post := decoded[posts.PostDTO](t, dummy.call("POST", "/api/v1/posts", map[string]any{"title": "Integration post", "content": "A persisted frontend integration post.", "imageUrls": []string{mediaURL}}, 201))
	postPath := "/api/v1/post?id=" + strconv.Itoa(post.PostId)
	readPost := decoded[posts.PostDTO](t, alex.call("GET", postPath, nil, 200))
	if len(readPost.ImageURLs) != 1 {
		t.Fatal("post media not persisted")
	}
	alex.call("DELETE", "/api/v1/posts?id="+strconv.Itoa(post.PostId), nil, 404)
	dummy.call("POST", "/api/v1/reactions", map[string]any{"entityType": "post", "entityId": post.PostId, "score": 1}, 200)
	liked := decoded[[]posts.PostDTO](t, dummy.call("GET", "/api/v1/users/me/posts?liked=true", nil, 200))
	if len(liked) != 1 {
		t.Fatal("liked posts missing")
	}
	dummy.call("POST", "/api/v1/reactions", map[string]any{"entityType": "post", "entityId": post.PostId, "score": 1}, 200)
	if p := decoded[posts.PostDTO](t, dummy.call("GET", postPath, nil, 200)); p.Score != 0 || p.UserScore != 0 {
		t.Fatal("reaction toggle failed")
	}

	commentData := decoded[comment.CommentDTO](t, alex.call("POST", "/api/v1/posts/comments", url.Values{"postId": {strconv.Itoa(post.PostId)}, "content": {"An integration comment"}}, 201))
	commentID := strconv.Itoa(commentData.CommentId)
	dummy.call("PUT", "/api/v1/posts/comments/"+commentID, map[string]string{"content": "Unauthorized edit"}, 404)
	alex.call("PUT", "/api/v1/posts/comments/"+commentID, map[string]string{"content": "Updated comment"}, 200)
	comments := decoded[comment.CommentResponse](t, dummy.call("GET", "/api/v1/posts/comments?postId="+strconv.Itoa(post.PostId), nil, 200))
	if len(comments.Comments) != 1 || comments.Comments[0].CommentText != "Updated comment" {
		t.Fatal("comment not persisted")
	}
	dummy.call("POST", "/api/v1/reactions", map[string]any{"entityType": "comment", "entityId": commentData.CommentId, "score": 1}, 200)
	notifications := decoded[notification.NotificationResponse](t, dummy.call("GET", "/api/v1/notifications", nil, 200))
	var commentNotificationID int
	for _, alert := range notifications.Notifications {
		if alert.EntityType == "comment" && alert.EntityId == commentData.CommentId && alert.PostId == post.PostId {
			commentNotificationID = alert.NotificationId
		}
	}
	if commentNotificationID == 0 {
		t.Fatal("comment notification missing")
	}
	dummy.call("PATCH", "/api/v1/notifications/"+strconv.Itoa(commentNotificationID)+"/read", nil, 200)
	dummy.call("PATCH", "/api/v1/notifications/read-all", nil, 200)
	count := decoded[notification.UnreadCountResponse](t, dummy.call("GET", "/api/v1/notifications/unread-count", nil, 200))
	if count.Count != 0 {
		t.Fatal("read notifications still counted")
	}
	alex.call("DELETE", "/api/v1/posts/comments?id="+commentID, nil, 200)
	if p := decoded[posts.PostDTO](t, dummy.call("GET", postPath, nil, 200)); p.CommentsCounter != 0 {
		t.Fatal("comment counter not decremented")
	}

	t.Run("stories expire and enforce ownership", func(t *testing.T) {
		created := decoded[map[string]int](t, dummy.call("POST", "/api/v1/stories", map[string]string{"content": "Story text", "mediaType": "text", "backgroundColor": "#4f46e5"}, 201))
		id := strconv.Itoa(created["storyId"])
		alex.call("DELETE", "/api/v1/stories/"+id, nil, 404)
		if stories := decoded[[]models.Story](t, dummy.call("GET", "/api/v1/stories", nil, 200)); len(stories) != 1 {
			t.Fatal("story missing")
		}
		if _, err := repo.Conn.Exec("UPDATE story SET expiresAt=datetime('now','-1 second') WHERE storyId=?", created["storyId"]); err != nil {
			t.Fatal(err)
		}
		if stories := decoded[[]models.Story](t, dummy.call("GET", "/api/v1/stories", nil, 200)); len(stories) != 0 {
			t.Fatal("expired story visible")
		}
		dummy.call("DELETE", "/api/v1/stories/"+id, nil, 200)
		dummy.call("POST", "/api/v1/stories", map[string]string{"mediaType": "image", "mediaUrl": mediaURL, "backgroundColor": "#4f46e5"}, 201)
	})

	t.Run("offline messages, read state and deletion", func(t *testing.T) {
		sent := decoded[message.MessageDTO](t, dummy.call("POST", "/api/v1/messages", map[string]string{"recipientId": "alex-id", "text": "Hello from the frontend", "mediaUrl": mediaURL, "mediaType": "image"}, 201))
		id := strconv.Itoa(sent.MessageId)
		alex.call("PUT", "/api/v1/messages/"+id, map[string]string{"text": "Unauthorized"}, 404)
		alex.call("DELETE", "/api/v1/messages/"+id+"?scope=everyone", nil, 404)
		dummy.call("PUT", "/api/v1/messages/"+id, map[string]string{"text": "Updated message"}, 200)
		messages := decoded[message.MessagesResponse](t, alex.call("GET", "/api/v1/messages?partnerId=dummy-id", nil, 200))
		if len(messages.Messages) != 1 || messages.Messages[0].TextMessage != "Updated message" || messages.Messages[0].MediaURL != mediaURL {
			t.Fatal("message not persisted")
		}
		alex.call("POST", "/api/v1/messages/read", map[string]string{"partnerId": "dummy-id"}, 200)
		alex.call("POST", "/api/v1/messages/read", map[string]string{"partnerId": "dummy-id"}, 200)
		messages = decoded[message.MessagesResponse](t, dummy.call("GET", "/api/v1/messages?partnerId=alex-id", nil, 200))
		if messages.Messages[0].IsRead != 1 {
			t.Fatal("read state not stored")
		}
		alex.call("DELETE", "/api/v1/messages/"+id+"?scope=me", nil, 200)
		messages = decoded[message.MessagesResponse](t, alex.call("GET", "/api/v1/messages?partnerId=dummy-id", nil, 200))
		if messages.TotalElements != 0 {
			t.Fatal("hidden message returned")
		}
		messages = decoded[message.MessagesResponse](t, dummy.call("GET", "/api/v1/messages?partnerId=alex-id", nil, 200))
		if messages.TotalElements != 1 {
			t.Fatal("delete for me affected sender")
		}
		dummy.call("DELETE", "/api/v1/messages/"+id+"?scope=everyone", nil, 200)
		messages = decoded[message.MessagesResponse](t, dummy.call("GET", "/api/v1/messages?partnerId=alex-id", nil, 200))
		if messages.TotalElements != 0 {
			t.Fatal("deleted message returned")
		}
	})

	t.Run("live messages", func(t *testing.T) {
		parsed, _ := url.Parse(server.URL)
		var cookies []string
		for _, cookie := range alex.client.Jar.Cookies(parsed) {
			cookies = append(cookies, cookie.String())
		}
		socket, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"/ws", http.Header{"Cookie": {strings.Join(cookies, "; ")}, "Origin": {server.URL}})
		if err != nil {
			t.Fatal(err)
		}
		defer socket.Close()
		dummy.call("POST", "/api/v1/messages", map[string]string{"recipientId": "alex-id", "text": "Live integration message"}, 201)
		socket.SetReadDeadline(time.Now().Add(3 * time.Second))
		for {
			_, data, err := socket.ReadMessage()
			if err != nil {
				t.Fatal(err)
			}
			for _, line := range bytes.Split(data, []byte("\n")) {
				var event struct {
					Type string `json:"type"`
				}
				json.Unmarshal(line, &event)
				if event.Type == "message_changed" {
					return
				}
			}
		}
	})
	dummy.call("DELETE", "/api/v1/posts?id="+strconv.Itoa(post.PostId), nil, 200)
	dummy.call("GET", postPath, nil, 404)
	// Original auth endpoints still accept their original form/cookie contract.
	dummy.call("POST", "/api/v1/auth/logout", nil, 200)
	dummy.call("GET", "/api/v1/auth/me", nil, 401)
	dummy.call("POST", "/api/v1/auth/login", url.Values{"identifier": {"dummy@example.com"}, "password": {"DummyUser123!"}}, 200)
	dummy.call("GET", "/api/v1/auth/me", nil, 200)
}

func TestDevSessionUnavailableByDefault(t *testing.T) {
	server, _ := integrationServer(t, false, false)
	newIntegrationClient(t, server).call("POST", "/api/v1/dev/session", map[string]string{}, 404)
}

func TestLiveConnectionUpdates(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	dummy, alex := newIntegrationClient(t, server), newIntegrationClient(t, server)
	dummy.login("dummy@example.com")
	alex.login("alex@example.com")

	connect := func(client integrationClient, userID string) *websocket.Conn {
		t.Helper()
		parsed, _ := url.Parse(server.URL)
		var cookies []string
		for _, cookie := range client.client.Jar.Cookies(parsed) {
			cookies = append(cookies, cookie.String())
		}
		socket, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"/ws", http.Header{"Cookie": {strings.Join(cookies, "; ")}, "Origin": {server.URL}})
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { socket.Close() })
		deadline := time.Now().Add(3 * time.Second)
		for !handlers.HandlerCtx.Hub.IsUserOnline(userID) {
			if time.Now().After(deadline) {
				t.Fatal("WebSocket was not registered")
			}
			time.Sleep(time.Millisecond)
		}
		return socket
	}
	readUpdate := func(socket *websocket.Conn, actorID string) {
		t.Helper()
		seen := map[string]bool{}
		socket.SetReadDeadline(time.Now().Add(3 * time.Second))
		for !seen["notification"] || !seen["social_changed"] {
			_, data, err := socket.ReadMessage()
			if err != nil {
				t.Fatal(err)
			}
			for _, line := range bytes.Split(data, []byte("\n")) {
				var event struct {
					Type    string `json:"type"`
					Payload struct {
						ActorID string `json:"actorId"`
					} `json:"payload"`
				}
				if err := json.Unmarshal(line, &event); err != nil {
					t.Fatal(err)
				}
				if event.Payload.ActorID == actorID {
					seen[event.Type] = true
				}
			}
		}
	}

	alexSocket := connect(alex, "alex-id")
	dummySocket := connect(dummy, "dummy-id")
	dummy.call("PUT", "/api/v1/users/alex-id/follow", nil, 200)
	readUpdate(alexSocket, "dummy-id")
	alex.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200)
	readUpdate(dummySocket, "alex-id")

	// The group flows push the created notification itself, the same shape the
	// comment, message and follow paths send, so a client no longer has to refetch
	// to learn what happened.
	readNotification := func(socket *websocket.Conn) notification.NotificationDTO {
		t.Helper()
		socket.SetReadDeadline(time.Now().Add(3 * time.Second))
		for {
			_, data, err := socket.ReadMessage()
			if err != nil {
				t.Fatal(err)
			}
			for _, line := range bytes.Split(data, []byte("\n")) {
				var event struct {
					Type    string          `json:"type"`
					Payload json.RawMessage `json:"payload"`
				}
				if err := json.Unmarshal(line, &event); err != nil {
					t.Fatal(err)
				}
				if event.Type == "notification" {
					var created notification.NotificationDTO
					if err := json.Unmarshal(event.Payload, &created); err != nil {
						t.Fatal(err)
					}
					return created
				}
			}
		}
	}
	// Marking everything read still announces a change without a row.
	readNotificationChange := func(socket *websocket.Conn) {
		t.Helper()
		socket.SetReadDeadline(time.Now().Add(3 * time.Second))
		for {
			_, data, err := socket.ReadMessage()
			if err != nil {
				t.Fatal(err)
			}
			for _, line := range bytes.Split(data, []byte("\n")) {
				var event struct {
					Type string `json:"type"`
				}
				if err := json.Unmarshal(line, &event); err != nil {
					t.Fatal(err)
				}
				if event.Type == "notification_changed" {
					return
				}
			}
		}
	}
	group := decoded[models.Group](t, dummy.call("POST", "/api/v1/groups", map[string]string{"title": "Live notifications"}, 201))
	base := fmt.Sprintf("/api/v1/groups/%d", group.GroupID)
	dummy.call("POST", base+"/invite/alex-id", nil, 200)
	invited := readNotification(alexSocket)
	if invited.EntityType != "group_invitation" || invited.EntityId != group.GroupID || invited.ActorId != "dummy-id" {
		t.Fatalf("unexpected invitation frame: %+v", invited)
	}
	alex.call("POST", base+"/join", nil, 200)
	requested := readNotification(dummySocket)
	if requested.EntityType != "group_request" || requested.EntityId != group.GroupID || requested.ActorId != "alex-id" {
		t.Fatalf("unexpected join request frame: %+v", requested)
	}
	dummy.call("PATCH", "/api/v1/notifications/read-all", nil, 200)
	readNotificationChange(dummySocket)
}

func TestDevSessionUnavailableInProduction(t *testing.T) {
	server, _ := integrationServer(t, true, true)
	newIntegrationClient(t, server).call("POST", "/api/v1/dev/session", map[string]string{}, 404)
}
