package websocket

import (
	"encoding/json"
	"testing"
	"time"
)

// The hub mutates its registry in its own goroutine, so a send on Register or
// Unregister only queues the work: these helpers wait for the effect instead of
// assuming it already happened.

func newTestHub(t *testing.T) *Hub {
	t.Helper()
	hub := NewHub()
	go hub.Run()
	t.Cleanup(hub.Stop)
	return hub
}

func testClient(hub *Hub, userID string) *Client {
	return &Client{Hub: hub, UserID: userID, Send: make(chan []byte, SendBufferSize)}
}

func waitFor(t *testing.T, what string, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func receive(t *testing.T, client *Client) []byte {
	t.Helper()
	select {
	case message, ok := <-client.Send:
		if !ok {
			t.Fatal("the send channel was closed")
		}
		return message
	case <-time.After(time.Second):
		t.Fatal("no frame arrived")
		return nil
	}
}

func expectNoFrame(t *testing.T, client *Client) {
	t.Helper()
	select {
	case message := <-client.Send:
		t.Fatalf("unexpected frame: %s", message)
	case <-time.After(20 * time.Millisecond):
	}
}

func closed(client *Client) bool {
	_, open := <-client.Send
	return !open
}

func decodeStatus(t *testing.T, frame []byte) statusFrame {
	t.Helper()
	var status statusFrame
	if err := json.Unmarshal(frame, &status); err != nil {
		t.Fatalf("presence frame is not JSON: %s", frame)
	}
	if status.Type != MsgTypeUserStatus {
		t.Fatalf("expected a %s frame, got %q", MsgTypeUserStatus, status.Type)
	}
	return status
}

type statusFrame struct {
	Type    string            `json:"type"`
	Payload UserStatusPayload `json:"payload"`
}

// TestHubDeliversOnlyToTheAddressedUser covers fan-out: a message reaches every
// socket of the named user, nobody else, and an unknown user reports no delivery.
func TestHubDeliversOnlyToTheAddressedUser(t *testing.T) {
	hub := newTestHub(t)
	alex, sam := testClient(hub, "alex"), testClient(hub, "sam")
	alexSecond := testClient(hub, "alex")
	hub.Register <- alex
	hub.Register <- alexSecond
	hub.Register <- sam
	// Sam registering announces him to every socket already connected, so each of
	// Alex's sockets holds that frame; drain both so the assertions below are
	// about delivery and nothing else.
	for name, client := range map[string]*Client{"first": alex, "second": alexSecond} {
		if status := decodeStatus(t, receive(t, client)); status.Payload.UserId != "sam" || status.Payload.IsOnline != 1 {
			t.Fatalf("unexpected presence frame on the %s socket: %+v", name, status)
		}
	}
	waitFor(t, "every client to register", func() bool { return hub.IsUserOnline("alex") && hub.IsUserOnline("sam") })

	if !hub.SendToUser("alex", []byte("for alex")) {
		t.Fatal("delivery to a connected user should report true")
	}
	for name, client := range map[string]*Client{"first": alex, "second": alexSecond} {
		if got := string(receive(t, client)); got != "for alex" {
			t.Fatalf("the %s socket got %q", name, got)
		}
	}
	expectNoFrame(t, sam)
	if hub.SendToUser("nobody", []byte("lost")) {
		t.Fatal("delivery to an unknown user must report false")
	}
}

// TestHubPresenceTracksTheFirstAndLastClient covers the online dot: a second
// socket for the same user must not announce anything, and only the last one
// leaving takes the user offline.
func TestHubPresenceTracksTheFirstAndLastClient(t *testing.T) {
	hub := newTestHub(t)
	first, second := testClient(hub, "alex"), testClient(hub, "alex")
	hub.Register <- first
	waitFor(t, "the first socket", func() bool { return hub.IsUserOnline("alex") })
	hub.Register <- second
	waitFor(t, "the second socket", func() bool { return hub.GetClientByUserID("alex") != nil })

	hub.Unregister <- first
	waitFor(t, "the first socket to leave", func() bool { return closed(first) })
	if !hub.IsUserOnline("alex") {
		t.Fatal("the user went offline while a socket was still connected")
	}
	if hub.SendToUser("alex", []byte("still here")) != true {
		t.Fatal("the remaining socket should still receive")
	}

	hub.Unregister <- second
	waitFor(t, "the last socket to leave", func() bool { return closed(second) })
	waitFor(t, "the user to go offline", func() bool { return !hub.IsUserOnline("alex") && len(hub.GetOnlineUsers()) == 0 })
}

// TestHubAnnouncesPresenceAndClosesEveryoneOnStop covers the two broadcasts the
// chat UI depends on and the shutdown path that releases every writer.
func TestHubAnnouncesPresenceAndClosesEveryoneOnStop(t *testing.T) {
	hub := newTestHub(t)
	watcher, leaving := testClient(hub, "sam"), testClient(hub, "alex")
	hub.Register <- watcher
	waitFor(t, "the watcher", func() bool { return hub.IsUserOnline("sam") })
	hub.Register <- leaving
	if status := decodeStatus(t, receive(t, watcher)); status.Payload.UserId != "alex" || status.Payload.IsOnline != 1 {
		t.Fatalf("unexpected presence frame: %+v", status)
	}
	hub.Unregister <- leaving
	if status := decodeStatus(t, receive(t, watcher)); status.Payload.UserId != "alex" || status.Payload.IsOnline != 0 {
		t.Fatalf("unexpected offline frame: %+v", status)
	}

	hub.BroadcastToAll([]byte("everyone"))
	if got := string(receive(t, watcher)); got != "everyone" {
		t.Fatalf("broadcast payload was %q", got)
	}

	hub.Stop()
	waitFor(t, "the hub to stop", func() bool { return len(hub.GetOnlineUsers()) == 0 })
	if !closed(watcher) {
		t.Fatal("stopping the hub must close every client channel")
	}
}

// TestHubBroadcastExceptSkipsTheNamedUser pins the rule the feed's new-posts notice
// relies on: every connected account hears the broadcast, and the one that caused it
// does not.
func TestHubBroadcastExceptSkipsTheNamedUser(t *testing.T) {
	hub := newTestHub(t)
	watcher, author := testClient(hub, "sam"), testClient(hub, "alex")
	hub.Register <- watcher
	waitFor(t, "the watcher", func() bool { return hub.IsUserOnline("sam") })
	hub.Register <- author
	// The author registering announces them to the watcher, so drain that frame first.
	if status := decodeStatus(t, receive(t, watcher)); status.Payload.UserId != "alex" {
		t.Fatalf("unexpected presence frame: %+v", status)
	}
	waitFor(t, "the author", func() bool { return hub.IsUserOnline("alex") })

	hub.BroadcastToAllExcept([]byte("new post"), "alex")
	if got := string(receive(t, watcher)); got != "new post" {
		t.Fatalf("the watcher should have heard the broadcast, got %q", got)
	}
	expectNoFrame(t, author)
}
