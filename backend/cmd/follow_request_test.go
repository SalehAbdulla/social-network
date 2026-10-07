package main

import (
	"net/http"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	backend "social-network/backend"
	"social-network/backend/pkg/app/service"
	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/notification"
)

func TestFollowRequestConcurrentAndRollback(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	repo.Conn.SetMaxOpenConns(4)
	owner := newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	if _, err := repo.Conn.Exec("UPDATE user SET isPublic=0"); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := repo.FollowUser("alex-id", "dummy-id"); results <- err }()
	}
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		} else if err != backend.ErrFollowPending {
			t.Fatalf("concurrent request returned unexpected error: %v", err)
		}
	}
	if successes != 1 {
		t.Fatalf("concurrent requests succeeded %d times", successes)
	}
	if _, err := repo.Conn.Exec("CREATE TRIGGER reject_follow BEFORE INSERT ON follow BEGIN SELECT RAISE(ABORT, 'test failure'); END"); err != nil {
		t.Fatal(err)
	}
	owner.call("PUT", "/api/v1/follow-requests/alex-id", nil, 500)
	items := decoded[[]models.FollowRequest](t, owner.call("GET", "/api/v1/follow-requests", nil, 200))
	if len(items) != 1 {
		t.Fatal("failed acceptance lost the request")
	}
	if _, err := repo.Conn.Exec("DROP TRIGGER reject_follow"); err != nil {
		t.Fatal(err)
	}
	owner.call("PUT", "/api/v1/follow-requests/alex-id", nil, 200)
	// The accepted connection row must be removed so the other direction can request.
	status, err := repo.FollowUser("dummy-id", "alex-id")
	if err != nil || status != "pending" {
		t.Fatalf("reverse request after acceptance: %q %v", status, err)
	}
}

func TestFollowRequests(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner, requester, stranger := newIntegrationClient(t, server), newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	requester.login("alex@example.com")
	if err := repo.InsertUser(models.Registration{
		UserID: "carol-id", Nickname: "carol", FirstName: "Carol", LastName: "Demo",
		Email: "carol@example.com", PasswordHash: "hash", BirthDate: "2000-01-01", BirthYear: 2000,
		Gender: "female", IsPublic: true,
	}); err != nil {
		t.Fatal(err)
	}
	service.DefaultSessionManager.CreateSession("carol-id", "carol-token")
	serverURL, _ := url.Parse(server.URL)
	stranger.client.Jar.SetCookies(serverURL, []*http.Cookie{{Name: "session_token", Value: "carol-token", Path: "/"}})
	profile := decoded[models.SocialUser](t, owner.call("GET", "/api/v1/users/me", nil, 200))
	profile.IsPublic = false
	owner.call("PUT", "/api/v1/users/me", profile, 200)
	var cookies []string
	for _, cookie := range owner.client.Jar.Cookies(serverURL) {
		cookies = append(cookies, cookie.Name+"="+cookie.Value)
	}
	socket, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"/ws", http.Header{"Cookie": {strings.Join(cookies, "; ")}, "Origin": {server.URL}})
	if err != nil {
		t.Fatal(err)
	}
	defer socket.Close()
	path := "/api/v1/users/dummy-id/follow"
	state := decoded[map[string]string](t, requester.call("PUT", path, nil, 200))
	if state["status"] != "pending" {
		t.Fatalf("unexpected state: %v", state)
	}
	socket.SetReadDeadline(time.Now().Add(3 * time.Second))
	for {
		_, data, err := socket.ReadMessage()
		if err != nil {
			t.Fatal("request notification was not pushed:", err)
		}
		if strings.Contains(string(data), `"follow_request"`) {
			break
		}
	}
	requester.call("PUT", path, nil, 409)
	owner.call("PUT", "/api/v1/users/alex-id/follow", nil, 409)
	owner.call("PUT", path, nil, 400)
	requester.call("PUT", "/api/v1/users/missing/follow", nil, 404)
	newIntegrationClient(t, server).call("GET", "/api/v1/follow-requests", nil, 401)
	owner.call("GET", "/api/v1/follow-requests?offset=-1", nil, 400)
	requests := decoded[[]models.FollowRequest](t, owner.call("GET", "/api/v1/follow-requests", nil, 200))
	if len(requests) != 1 || requests[0].UserID != "alex-id" {
		t.Fatalf("unexpected requests: %+v", requests)
	}
	if items := decoded[[]models.FollowRequest](t, stranger.call("GET", "/api/v1/follow-requests", nil, 200)); len(items) != 0 {
		t.Fatal("requests leaked to stranger")
	}
	if items := decoded[[]models.FollowRequest](t, owner.call("GET", "/api/v1/follow-requests?offset=30", nil, 200)); len(items) != 0 {
		t.Fatal("pagination ignored")
	}
	view := decoded[models.SocialUser](t, requester.call("GET", "/api/v1/users/dummy-id", nil, 200))
	if !view.PendingOutgoing || view.PendingIncoming || view.Bio != "" || len(view.Followers) != 0 {
		t.Fatalf("pending profile leaked: %+v", view)
	}
	incoming := decoded[models.SocialUser](t, owner.call("GET", "/api/v1/users/alex-id", nil, 200))
	if !incoming.PendingIncoming || incoming.PendingOutgoing {
		t.Fatalf("wrong incoming flags: %+v", incoming)
	}
	other := decoded[models.SocialUser](t, stranger.call("GET", "/api/v1/users/dummy-id", nil, 200))
	if other.PendingIncoming || other.PendingOutgoing {
		t.Fatal("pending flags leaked")
	}
	requester.call("GET", "/api/v1/users/dummy-id/posts", nil, 404)
	requester.call("GET", "/api/v1/users/dummy-id/follows", nil, 404)
	alerts := decoded[notification.NotificationResponse](t, owner.call("GET", "/api/v1/notifications", nil, 200))
	if len(alerts.Notifications) != 1 || alerts.Notifications[0].EntityType != "follow_request" {
		t.Fatalf("unexpected alerts: %+v", alerts)
	}
	count := decoded[map[string]int](t, owner.call("GET", "/api/v1/notifications/unread-count", nil, 200))
	if count["count"] != 1 {
		t.Fatalf("request badge count: %v", count)
	}
	stranger.call("PUT", "/api/v1/follow-requests/alex-id", nil, 404)
	stranger.call("DELETE", "/api/v1/follow-requests/alex-id", nil, 404)
	requester.call("PUT", "/api/v1/follow-requests/dummy-id", nil, 404)
	owner.call("PUT", "/api/v1/follow-requests/alex-id", nil, 200)
	owner.call("PUT", "/api/v1/follow-requests/alex-id", nil, 404)
	requester.call("GET", "/api/v1/users/dummy-id/posts", nil, 200)
	view = decoded[models.SocialUser](t, requester.call("GET", "/api/v1/users/dummy-id", nil, 200))
	if view.PendingOutgoing || len(view.Followers) != 1 || view.Followers[0] != "alex-id" {
		t.Fatalf("accept failed: %+v", view)
	}
	requester.call("PUT", path, nil, 409)
	requester.call("DELETE", path, nil, 200)
	requester.call("GET", "/api/v1/users/dummy-id/posts", nil, 404)
	for _, action := range []string{"decline", "cancel"} {
		requester.call("PUT", path, nil, 200)
		if action == "decline" {
			owner.call("DELETE", "/api/v1/follow-requests/alex-id", nil, 200)
		} else {
			requester.call("DELETE", path, nil, 200)
		}
		requester.call("GET", "/api/v1/users/dummy-id/posts", nil, 404)
		items := decoded[[]models.FollowRequest](t, owner.call("GET", "/api/v1/follow-requests", nil, 200))
		if len(items) != 0 {
			t.Fatal(action + " left pending request")
		}
		count = decoded[map[string]int](t, owner.call("GET", "/api/v1/notifications/unread-count", nil, 200))
		if count["count"] != 0 {
			t.Fatal(action + " left stale notification")
		}
	}
	// Changing to public does not silently accept existing requests.
	requester.call("PUT", path, nil, 200)
	profile.IsPublic = true
	owner.call("PUT", "/api/v1/users/me", profile, 200)
	requester.call("PUT", path, nil, 409)
	requester.call("DELETE", path, nil, 200)
	state = decoded[map[string]string](t, requester.call("PUT", path, nil, 200))
	if state["status"] != "following" {
		t.Fatal("public follow was not instant")
	}
	requester.call("PUT", path, nil, 409)
	alerts = decoded[notification.NotificationResponse](t, owner.call("GET", "/api/v1/notifications", nil, 200))
	if len(alerts.Notifications) != 1 || alerts.Notifications[0].EntityType != "follow" {
		t.Fatalf("public follow alerts: %+v", alerts)
	}
}
