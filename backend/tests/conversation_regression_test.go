package tests

import (
	"fmt"
	"strings"
	"testing"

	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/message"
)

func TestConversationListsOnlyIncludeHistoryAndMembership(t *testing.T) {
	server, repo := integrationServer(t, false, false)
	owner, member := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	member.login("alex@example.com")
	assertChats := func(client integrationClient, want int) {
		t.Helper()
		got := decoded[[]message.ChatUserDTO](t, client.call("GET", "/api/v1/messages/users", nil, 200))
		if len(got) != want {
			t.Fatalf("got %d conversations, want %d: %+v", len(got), want, got)
		}
	}
	assertChats(owner, 0)
	assertChats(member, 0)
	owner.call("GET", "/api/v1/messages?partnerId=alex-id", nil, 200)
	assertChats(owner, 0)
	sent := decoded[message.MessageDTO](t, owner.call("POST", "/api/v1/messages", map[string]string{"recipientId": "alex-id", "text": "First message"}, 201))
	assertChats(owner, 1)
	assertChats(member, 1)
	member.call("DELETE", fmt.Sprintf("/api/v1/messages/%d?scope=me", sent.MessageId), nil, 200)
	assertChats(member, 0)
	assertChats(owner, 1)
	owner.call("DELETE", fmt.Sprintf("/api/v1/messages/%d?scope=everyone", sent.MessageId), nil, 200)
	assertChats(owner, 0)

	group, err := repo.CreateGroup("dummy-id", "Joined group", "Find me by description")
	if err != nil {
		t.Fatal(err)
	}
	base := fmt.Sprintf("/api/v1/groups/%d", group.GroupID)
	for i := 0; i < 35; i++ {
		if _, err := repo.CreateGroup("alex-id", fmt.Sprintf("Other group %d", i), "Find me by description"); err != nil {
			t.Fatal(err)
		}
	}
	groups := decoded[[]models.Group](t, owner.call("GET", "/api/v1/groups?scope=joined&q=description", nil, 200))
	if len(groups) != 1 || groups[0].GroupID != group.GroupID {
		t.Fatalf("joined groups filtered after pagination: %+v", groups)
	}
	member.call("POST", base+"/join", nil, 200)
	pending := decoded[models.Group](t, member.call("GET", base, nil, 200))
	if !pending.JoinRequested || pending.IsMember {
		t.Fatalf("wrong pending state: %+v", pending)
	}
	groups = decoded[[]models.Group](t, member.call("GET", "/api/v1/groups?scope=joined&q=Joined", nil, 200))
	if len(groups) != 0 {
		t.Fatal("pending request appeared as a joined group")
	}
	requests := decoded[[]models.GroupRequest](t, owner.call("GET", base+"/requests", nil, 200))
	owner.call("PUT", fmt.Sprintf("%s/requests/%d", base, requests[0].RequestID), map[string]string{"status": "accepted"}, 200)
	groups = decoded[[]models.Group](t, member.call("GET", "/api/v1/groups?scope=joined&q=Joined", nil, 200))
	if len(groups) != 1 || !groups[0].IsMember {
		t.Fatal("accepted member is missing the group")
	}
	member.call("DELETE", base+"/members/alex-id", nil, 200)
	groups = decoded[[]models.Group](t, member.call("GET", "/api/v1/groups?scope=joined&q=Joined", nil, 200))
	if len(groups) != 0 {
		t.Fatal("left group remains in conversation list")
	}
}

func TestProfileLocationLength(t *testing.T) {
	server, _ := integrationServer(t, false, false)
	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")
	profile := decoded[models.SocialUser](t, client.call("GET", "/api/v1/users/me", nil, 200))
	profile.Location = strings.Repeat("界", 50)
	saved := decoded[models.SocialUser](t, client.call("PUT", "/api/v1/users/me", profile, 200))
	if saved.Location != profile.Location {
		t.Fatal("valid location was not preserved")
	}
	profile.Location += "界"
	client.call("PUT", "/api/v1/users/me", profile, 400)
}
