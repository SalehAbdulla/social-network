package main

import (
	"fmt"
	"social-network/backend/pkg/models"
	"testing"
	"time"
)

func TestGroupContentPrivacyAndRSVP(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	owner, member := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	member.login("alex@example.com")
	group := decoded[models.Group](t, owner.call("POST", "/api/v1/groups", map[string]string{"title": "Integration group"}, 201))
	base := fmt.Sprintf("/api/v1/groups/%d", group.GroupID)
	for _, kind := range []string{"posts", "events", "messages"} {
		member.call("GET", base+"/content/"+kind, nil, 404)
		member.call("POST", base+"/content/"+kind, map[string]string{"content": "Forbidden"}, 404)
	}
	owner.call("POST", base+"/invite/alex-id", nil, 200)
	owner.call("POST", base+"/invite/alex-id", nil, 200)
	invites := decoded[[]models.GroupInvitation](t, member.call("GET", "/api/v1/groups/invitations", nil, 200))
	if len(invites) != 1 {
		t.Fatalf("expected one invitation, got %d", len(invites))
	}
	decision := fmt.Sprintf("%s/invitations/%d", base, invites[0].InvitationID)
	owner.call("PUT", decision, map[string]string{"status": "accepted"}, 403)
	member.call("PUT", decision, map[string]string{"status": "accepted"}, 200)
	member.call("PUT", decision, map[string]string{"status": "accepted"}, 404)
	post := decoded[models.GroupContent](t, member.call("POST", base+"/content/posts", map[string]string{"content": "Members only"}, 201))
	comments := fmt.Sprintf("%s/content/comments?parentId=%d", base, post.ID)
	owner.call("POST", comments, map[string]string{"content": "A group comment"}, 201)
	items := decoded[[]models.GroupContent](t, member.call("GET", comments, nil, 200))
	if len(items) != 1 {
		t.Fatal("missing comment")
	}
	member.call("POST", base+"/content/events", map[string]string{"title": "Bad date", "content": "Invalid", "startsAt": "yesterday"}, 400)
	event := decoded[models.GroupContent](t, owner.call("POST", base+"/content/events", map[string]string{"title": "Group meetup", "content": "Meet tomorrow", "startsAt": time.Now().Add(24 * time.Hour).Format(time.RFC3339)}, 201))
	rsvp := fmt.Sprintf("%s/events/%d/rsvp", base, event.ID)
	member.call("PUT", rsvp, map[string]string{"status": "maybe"}, 400)
	member.call("PUT", rsvp, map[string]string{"status": "going"}, 200)
	member.call("PUT", rsvp, map[string]string{"status": "not_going"}, 200)
	events := decoded[[]models.GroupContent](t, member.call("GET", base+"/content/events", nil, 200))
	if len(events) != 1 || events[0].Going != 0 || events[0].NotGoing != 1 || events[0].RSVP != "not_going" {
		t.Fatalf("bad RSVP counts: %+v", events)
	}
	member.call("POST", base+"/content/messages", map[string]string{"content": "Hello 👋"}, 201)
	messages := decoded[[]models.GroupContent](t, owner.call("GET", base+"/content/messages", nil, 200))
	if len(messages) != 1 || messages[0].Content != "Hello 👋" {
		t.Fatal("chat not persisted")
	}
	other := decoded[models.Group](t, owner.call("POST", "/api/v1/groups", map[string]string{"title": "Another group"}, 201))
	otherBase := fmt.Sprintf("/api/v1/groups/%d", other.GroupID)
	owner.call("GET", fmt.Sprintf("%s/content/comments?parentId=%d", otherBase, post.ID), nil, 404)
	owner.call("PUT", fmt.Sprintf("%s/events/%d/rsvp", otherBase, event.ID), map[string]string{"status": "going"}, 404)
	var count int
	notifications := decoded[struct {
		Notifications []struct {
			EntityType string `json:"entityType"`
			EntityID   int    `json:"entityId"`
		}
	}](t, member.call("GET", "/api/v1/notifications?limit=20", nil, 200))
	for _, n := range notifications.Notifications {
		if n.EntityType == "group_invitation" || n.EntityType == "group_event" {
			count++
			if n.EntityID != group.GroupID {
				t.Fatal("wrong notification target")
			}
		}
	}
	if count != 2 {
		t.Fatalf("expected two notifications, got %d", count)
	}
}
