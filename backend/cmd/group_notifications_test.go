package main

import (
	"fmt"
	"testing"

	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/notification"
)

// TestGroupNotificationsCoverEveryMember proves the group flows announce
// themselves through the notification service rather than by raw inserts: the
// owner hears about a join request, the invitee hears about an invitation, a new
// event reaches every other member exactly once, and nothing is duplicated when
// the same action is repeated while the first one is still pending.
func TestGroupNotificationsCoverEveryMember(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner, guest := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	guest.login("alex@example.com")
	// A third member, registered with the mandatory fields only, so the handle is
	// generated (see TestRegisterFieldParity).
	inviteeClient := newIntegrationClient(t, server)
	invitee := decoded[map[string]string](t, inviteeClient.call("POST", "/api/v1/auth/register", registerValues("Carol", "Invitee", "carol@example.com"), 201))
	inviteeID := invitee["userId"]
	if inviteeID == "" {
		t.Fatal("the third member got no id")
	}

	countFor := func(userID, entityType string) int {
		t.Helper()
		var count int
		if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM notification WHERE userId=? AND entityType=?", userID, entityType).Scan(&count); err != nil {
			t.Fatal(err)
		}
		return count
	}
	targetFor := func(userID, entityType string) (int, string) {
		t.Helper()
		var entityID int
		var actorID string
		if err := repo.Conn.QueryRow("SELECT entityId, actorId FROM notification WHERE userId=? AND entityType=?", userID, entityType).Scan(&entityID, &actorID); err != nil {
			t.Fatal(err)
		}
		return entityID, actorID
	}

	group := decoded[models.Group](t, owner.call("POST", "/api/v1/groups", map[string]string{"title": "Notification group"}, 201))
	base := fmt.Sprintf("/api/v1/groups/%d", group.GroupID)

	// An invitation reaches the invitee, and repeating it adds nothing.
	owner.call("POST", base+"/invite/"+inviteeID, nil, 200)
	if got := countFor(inviteeID, "group_invitation"); got != 1 {
		t.Fatalf("invitation notifications = %d, want 1", got)
	}
	owner.call("POST", base+"/invite/"+inviteeID, nil, 200)
	if got := countFor(inviteeID, "group_invitation"); got != 1 {
		t.Fatalf("repeat invitation notifications = %d, want 1", got)
	}
	// The row points at the group, which is the id the deep link uses.
	if entityID, actorID := targetFor(inviteeID, "group_invitation"); entityID != group.GroupID || actorID != "dummy-id" {
		t.Fatalf("invitation target = group %d by %q, want group %d by dummy-id", entityID, actorID, group.GroupID)
	}
	// And it is listed with the same shape the notifications page renders.
	listed := decoded[notification.NotificationResponse](t, inviteeClient.call("GET", "/api/v1/notifications?limit=20&types=group_invitation", nil, 200))
	if len(listed.Notifications) != 1 || listed.Notifications[0].EntityId != group.GroupID || listed.Notifications[0].ActorId != "dummy-id" {
		t.Fatalf("listed invitation = %+v", listed.Notifications)
	}

	// A join request reaches the owner, and repeating it adds nothing.
	guest.call("POST", base+"/join", nil, 200)
	if got := countFor("dummy-id", "group_request"); got != 1 {
		t.Fatalf("join request notifications = %d, want 1", got)
	}
	guest.call("POST", base+"/join", nil, 200)
	if got := countFor("dummy-id", "group_request"); got != 1 {
		t.Fatalf("repeat join request notifications = %d, want 1", got)
	}
	if entityID, actorID := targetFor("dummy-id", "group_request"); entityID != group.GroupID || actorID != "alex-id" {
		t.Fatalf("join request target = group %d by %q", entityID, actorID)
	}

	// Accept the request so the group has a second member for the event fan-out.
	requests := decoded[[]models.GroupRequest](t, owner.call("GET", base+"/requests", nil, 200))
	if len(requests) != 1 || requests[0].UserID != "alex-id" {
		t.Fatalf("pending requests = %+v", requests)
	}
	owner.call("PUT", fmt.Sprintf("%s/requests/%d", base, requests[0].RequestID), map[string]string{"status": "accepted"}, 200)

	// A new event tells every other member, and only them.
	owner.call("POST", base+"/content/events", map[string]any{
		"title": "Notification meetup", "content": "Bring a friend", "startsAt": "2030-12-01T18:00:00Z",
	}, 201)
	if got := countFor("alex-id", "group_event"); got != 1 {
		t.Fatalf("event notifications for the member = %d, want 1", got)
	}
	if entityID, actorID := targetFor("alex-id", "group_event"); entityID != group.GroupID || actorID != "dummy-id" {
		t.Fatalf("event target = group %d by %q", entityID, actorID)
	}
	if got := countFor("dummy-id", "group_event"); got != 0 {
		t.Fatalf("the author notified themselves about their own event (%d)", got)
	}
	if got := countFor(inviteeID, "group_event"); got != 0 {
		t.Fatalf("a non-member was told about the event (%d)", got)
	}

	// Anything that is not an event stays quiet.
	guest.call("POST", base+"/content/posts", map[string]any{"content": "A group post is not an event"}, 201)
	if got := countFor("alex-id", "group_event"); got != 1 {
		t.Fatalf("a group post notified about an event (%d)", got)
	}
	var total int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM notification WHERE userId='alex-id'").Scan(&total); err != nil {
		t.Fatal(err)
	}
	if total != 1 {
		t.Fatalf("the member received %d notifications in total, want only the event", total)
	}
}
