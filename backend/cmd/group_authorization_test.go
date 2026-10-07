package main

import (
	"fmt"
	"net/http/httptest"
	"testing"

	"social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/models"
)

// registerAccount signs a third or fourth member up through the real endpoint.
// The group edges need accounts holding different roles at the same moment, and
// the seeded harness has only two.
func registerAccount(t *testing.T, server *httptest.Server, first, last, email string) (integrationClient, string) {
	t.Helper()
	client := newIntegrationClient(t, server)
	client.call("POST", "/api/v1/auth/register", registerValues(first, last, email), 201)
	profile := decoded[models.SocialUser](t, client.call("GET", "/api/v1/users/me", nil, 200))
	return client, profile.UserID
}

// TestGroupMembershipAuthorizationEdges covers who may leave, remove, transfer
// and delete. The happy paths already run in group_management_test.go; this pins
// the refusals, because letting a plain member evict another one, or leaving a
// group without an owner, breaks a group without an error message to show for it.
func TestGroupMembershipAuthorizationEdges(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner := newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	member := newIntegrationClient(t, server)
	member.login("alex@example.com")
	carol, carolID := registerAccount(t, server, "Carol", "Member", "carol@example.com")
	stranger, strangerID := registerAccount(t, server, "Dave", "Stranger", "dave@example.com")

	group := decoded[models.Group](t, owner.call("POST", "/api/v1/groups", map[string]string{
		"title": "Authorization edges", "description": "Who may do what",
	}, 201))
	base := fmt.Sprintf("/api/v1/groups/%d", group.GroupID)

	// Both other members join by invitation, so they hold no role at all.
	owner.call("POST", base+"/invite/alex-id", nil, 200)
	owner.call("POST", base+"/invite/"+carolID, nil, 200)
	carolInvitations := decoded[[]models.GroupInvitation](t, carol.call("GET", "/api/v1/groups/invitations", nil, 200))
	if len(carolInvitations) != 1 {
		t.Fatalf("expected exactly one invitation for Carol, got %+v", carolInvitations)
	}
	// An invitation belongs to its invitee, so nobody else can answer it.
	stranger.call("PUT", fmt.Sprintf("%s/invitations/%d", base, carolInvitations[0].InvitationID),
		map[string]string{"status": "accepted"}, 403)
	carol.call("PUT", fmt.Sprintf("%s/invitations/%d", base, carolInvitations[0].InvitationID),
		map[string]string{"status": "accepted"}, 200)
	alexInvitations := decoded[[]models.GroupInvitation](t, member.call("GET", "/api/v1/groups/invitations", nil, 200))
	member.call("PUT", fmt.Sprintf("%s/invitations/%d", base, alexInvitations[0].InvitationID),
		map[string]string{"status": "accepted"}, 200)

	// A plain member cannot remove the owner and cannot remove another member.
	member.call("DELETE", base+"/members/dummy-id", nil, 403)
	member.call("DELETE", base+"/members/"+carolID, nil, 403)

	// Only the owner transfers, only to the literal role "owner", and only to
	// somebody who is already a member.
	carol.call("PUT", base+"/members/"+carolID, map[string]string{"role": "owner"}, 403)
	owner.call("PUT", base+"/members/alex-id", map[string]string{"role": "moderator"}, 400)
	owner.call("PUT", base+"/members/"+strangerID, map[string]string{"role": "owner"}, 404)

	// The owner can neither be removed nor walk away: ownership has to be
	// transferred or the group deleted, so a group is never left ownerless.
	owner.call("DELETE", base+"/members/dummy-id", nil, 400)

	// Hand the group over, then check what the former owner may still do.
	owner.call("PUT", base+"/members/alex-id", map[string]string{"role": "owner"}, 200)
	owner.call("DELETE", base, nil, 403)
	owner.call("DELETE", base+"/members/alex-id", nil, 403)
	if transferred := decoded[models.Group](t, owner.call("GET", base, nil, 200)); transferred.IsOwner || !transferred.IsMember {
		t.Fatalf("a transferred group still reports the wrong roles: %+v", transferred)
	}

	// A plain member may still leave, and leaving closes every member-only door.
	owner.call("DELETE", base+"/members/dummy-id", nil, 200)
	owner.call("GET", base+"/members", nil, 404)
	owner.call("POST", base+"/content/messages", map[string]string{"content": "Am I still here?"}, 404)
	if left := decoded[models.Group](t, owner.call("GET", base, nil, 200)); left.IsMember {
		t.Fatal("leaving the group kept the membership flag")
	}

	// A non-member can do nothing in the group, and cannot leave it either.
	stranger.call("DELETE", base, nil, 403)
	stranger.call("PUT", base+"/members/"+carolID, map[string]string{"role": "owner"}, 403)
	stranger.call("DELETE", base+"/members/"+carolID, nil, 403)

	// Joining needs the owner's decision: a plain member cannot read or accept
	// the pending requests.
	stranger.call("POST", base+"/join", nil, 200)
	requests := decoded[[]models.GroupRequest](t, member.call("GET", base+"/requests", nil, 200))
	if len(requests) != 1 || requests[0].UserID != strangerID {
		t.Fatalf("unexpected join requests: %+v", requests)
	}
	decisionPath := fmt.Sprintf("%s/requests/%d", base, requests[0].RequestID)
	carol.call("GET", base+"/requests", nil, 403)
	carol.call("PUT", decisionPath, map[string]string{"status": "accepted"}, 403)
	if joined := decoded[models.Group](t, stranger.call("GET", base, nil, 200)); joined.IsMember {
		t.Fatal("a plain member accepted a join request")
	}
	member.call("PUT", decisionPath, map[string]string{"status": "accepted"}, 200)
	if joined := decoded[models.Group](t, stranger.call("GET", base, nil, 200)); !joined.IsMember {
		t.Fatal("the owner's acceptance did not add the applicant")
	}

	// A member may leave of their own accord; the row count follows the change.
	carol.call("DELETE", base+"/members/"+carolID, nil, 200)
	if count := membershipCount(t, repo, group.GroupID); count != 2 {
		t.Fatalf("expected the owner and the accepted applicant to remain, found %d members", count)
	}

	// Only the owner deletes the group, and that takes the memberships with it
	// rather than leaving rows pointing at a group that is gone.
	member.call("DELETE", base, nil, 200)
	member.call("GET", base, nil, 404)
	if count := membershipCount(t, repo, group.GroupID); count != 0 {
		t.Fatalf("deleting the group left %d membership rows", count)
	}
}

func membershipCount(t *testing.T, repo *repositories.DB, groupID int) int {
	t.Helper()
	var count int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM socialGroupMember WHERE groupId=?", groupID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}
