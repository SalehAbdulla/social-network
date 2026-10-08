package main

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"social-network/backend/pkg/models"
)

func TestWebSocketFanOutToFiftyMembers(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)
	serverURL, _ := url.Parse(server.URL)

	owner := newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	group := decoded[models.Group](t, owner.call("POST", "/api/v1/groups", map[string]string{
		"title": "Load smoke", "description": "Fifty members in one room",
	}, 201))

	const members = 50
	ids := seedPagerAccounts(t, repo, members)
	addGroupRows(t, repo, "INSERT INTO socialGroupMember (groupId,userId,joinedAt) VALUES (?,?,'2026-01-01 00:00:00')", group.GroupID, ids)

	sockets := make([]*websocket.Conn, 0, members)
	for index, id := range ids {
		token := fmt.Sprintf("load-smoke-token-%02d", index)
		if err := manager.CreateSession(id, token); err != nil {
			t.Fatal(err)
		}
		socket := dialSocket(t, clientWithToken(t, server, token), serverURL)
		defer socket.Close()
		sockets = append(sockets, socket)
	}

	owner.call("POST", fmt.Sprintf("/api/v1/groups/%d/content/messages", group.GroupID),
		map[string]string{"content": "Everyone should see this"}, 201)

	start := time.Now()
	for index, socket := range sockets {
		frame := waitForFrame(t, socket, "group_changed", 15*time.Second)
		if len(frame.Payload) == 0 {
			t.Fatalf("member %d received a group_changed frame with no payload", index)
		}
	}
	t.Logf("50 group broadcasts delivered in %s", time.Since(start).Round(time.Millisecond))
}

func TestSustainedRequestThroughput(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")

	const workers, perWorker = 8, 25
	start := time.Now()
	failures := make(chan error, workers)
	var group sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		group.Add(1)
		go func() {
			defer group.Done()
			for request := 0; request < perWorker; request++ {
				response, err := client.client.Get(server.URL + "/api/v1/posts?page=1&size=5")
				if err != nil {
					failures <- err
					return
				}
				io.Copy(io.Discard, response.Body)
				response.Body.Close()
				if response.StatusCode != 200 {
					failures <- fmt.Errorf("a request was answered %d", response.StatusCode)
					return
				}
			}
		}()
	}
	group.Wait()
	close(failures)
	for err := range failures {
		t.Fatalf("under load: %v", err)
	}
	elapsed := time.Since(start)
	t.Logf("%d requests over %d workers in %s (%.0f req/s)",
		workers*perWorker, workers, elapsed.Round(time.Millisecond), float64(workers*perWorker)/elapsed.Seconds())
}

const rateLimitPerMinute = 1200

func TestRateLimitBoundaryThroughTheMiddleware(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	client := newIntegrationClient(t, server)

	for request := 1; request <= rateLimitPerMinute; request++ {
		response, err := client.client.Get(server.URL + "/api/v1/health")
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, response.Body)
		response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("request %d of %d was answered %d, so the limit sits below %d",
				request, rateLimitPerMinute, response.StatusCode, rateLimitPerMinute)
		}
	}

	response, err := client.client.Get(server.URL + "/api/v1/health")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	io.Copy(io.Discard, response.Body)
	if response.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("request %d was answered %d, want 429", rateLimitPerMinute+1, response.StatusCode)
	}
	if retry := response.Header.Get("Retry-After"); retry == "" {
		t.Fatal("a limited response has to say when to try again")
	}
}

func TestConfiguredRateLimitMovesTheBoundary(t *testing.T) {
	previous := app.RateLimitPerMinute
	t.Cleanup(func() { app.RateLimitPerMinute = previous })

	server, _ := integrationServer(t, true, false)
	client := newIntegrationClient(t, server)

	app.RateLimitPerMinute = 0
	if resolved := effectiveRateLimitPerMinute(); resolved != rateLimitPerMinute {
		t.Fatalf("an unset limit resolved to %d, want the default %d", resolved, rateLimitPerMinute)
	}
	app.RateLimitPerMinute = -1
	if resolved := effectiveRateLimitPerMinute(); resolved != rateLimitPerMinute {
		t.Fatalf("a negative limit resolved to %d, want the default %d", resolved, rateLimitPerMinute)
	}

	const configured = 5
	app.RateLimitPerMinute = configured
	for request := 1; request <= configured; request++ {
		response, err := client.client.Get(server.URL + "/api/v1/health")
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, response.Body)
		response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("request %d of %d was answered %d, so the configured limit sits below %d",
				request, configured, response.StatusCode, configured)
		}
	}
	response, err := client.client.Get(server.URL + "/api/v1/health")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	io.Copy(io.Discard, response.Body)
	if response.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("request %d was answered %d, want 429: the configured limit was ignored",
			configured+1, response.StatusCode)
	}
}
