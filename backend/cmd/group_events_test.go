package main

import (
	"fmt"
	"slices"
	"testing"
	"time"

	"social-network/backend/pkg/app/handlers"
	"social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/notification"
)

// createEvent posts an event through the API, so its startsAt is stored in the
// same RFC3339 form production writes.
func createEvent(t *testing.T, client integrationClient, base, title string, startsAt time.Time) models.GroupContent {
	t.Helper()
	return decoded[models.GroupContent](t, client.call("POST", base+"/content/events", map[string]string{
		"title": title, "content": "Where and when", "startsAt": startsAt.UTC().Format(time.RFC3339),
	}, 201))
}

// insertEvent writes an event straight to the table, which is the only way to get
// one whose start has already passed: the API refuses a start that is not in the
// future.
func insertEvent(t *testing.T, repo *repositories.DB, groupID int, title string, startsAt time.Time) int {
	t.Helper()
	result, err := repo.Conn.Exec(
		"INSERT INTO groupContent (groupId,userId,kind,title,content,startsAt) VALUES (?,?,?,?,?,?)",
		groupID, "dummy-id", "events", title, "Where and when", startsAt.UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatal(err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	return int(id)
}

func joinGroupByInvitation(t *testing.T, owner, member integrationClient, groupID int, userID string) {
	t.Helper()
	base := fmt.Sprintf("/api/v1/groups/%d", groupID)
	owner.call("POST", base+"/invite/"+userID, nil, 200)
	for _, invitation := range decoded[[]models.GroupInvitation](t, member.call("GET", "/api/v1/groups/invitations", nil, 200)) {
		if invitation.GroupID == groupID {
			member.call("PUT", fmt.Sprintf("%s/invitations/%d", base, invitation.InvitationID),
				map[string]string{"status": "accepted"}, 200)
			return
		}
	}
	t.Fatalf("no invitation for %s in group %d", userID, groupID)
}

func reminderStamp(t *testing.T, repo *repositories.DB, eventID int) string {
	t.Helper()
	var stamp string
	if err := repo.Conn.QueryRow("SELECT reminderSentAt FROM groupContent WHERE id=?", eventID).Scan(&stamp); err != nil {
		t.Fatal(err)
	}
	return stamp
}

// TestGroupEventsAreOrderedUpcomingThenPast pins the ordering the events tab
// splits on. The second past event is deliberately the one that just started:
// startsAt is stored as RFC3339 ("2026-09-29T18:00:00Z"), so an ordering that
// compared that string with datetime('now') would call an event later today
// upcoming, because 'T' sorts after ' '.
func TestGroupEventsAreOrderedUpcomingThenPast(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner := newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	group := decoded[models.Group](t, owner.call("POST", "/api/v1/groups", map[string]string{
		"title": "Event order", "description": "Upcoming before past",
	}, 201))
	base := fmt.Sprintf("/api/v1/groups/%d", group.GroupID)

	soon := createEvent(t, owner, base, "Starts soon", time.Now().Add(30*time.Minute))
	later := createEvent(t, owner, base, "Starts later", time.Now().Add(4*time.Hour))
	justStarted := insertEvent(t, repo, group.GroupID, "Just started", time.Now().Add(-time.Minute))
	yesterday := insertEvent(t, repo, group.GroupID, "Yesterday", time.Now().Add(-24*time.Hour))

	got := []int{}
	events := decoded[[]models.GroupContent](t, owner.call("GET", base+"/content/events", nil, 200))
	for _, event := range events {
		got = append(got, event.ID)
	}
	want := []int{soon.ID, later.ID, justStarted, yesterday}
	if !slices.Equal(got, want) {
		t.Fatalf("event order %v, want %v: upcoming soonest first, then past most recent first", got, want)
	}
	// The flag the events tab splits on has to agree with that order, because the
	// server decides both from the same expression.
	for index, event := range events {
		if wantUpcoming := index < 2; event.Upcoming != wantUpcoming {
			t.Fatalf("event %q reports upcoming=%v, want %v", event.Title, event.Upcoming, wantUpcoming)
		}
	}
}

// TestEventReminderNotifiesGoingMembersOnce covers the reminder sweep: who hears
// about an event an hour before it starts, who does not, and what stops the
// ticker from sending the same reminder twice.
func TestEventReminderNotifiesGoingMembersOnce(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner := newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	member := newIntegrationClient(t, server)
	member.login("alex@example.com")
	decliner, declinerID := registerAccount(t, server, "Carol", "Declines", "carol@example.com")

	group := decoded[models.Group](t, owner.call("POST", "/api/v1/groups", map[string]string{
		"title": "Reminders", "description": "Who gets told",
	}, 201))
	base := fmt.Sprintf("/api/v1/groups/%d", group.GroupID)
	joinGroupByInvitation(t, owner, member, group.GroupID, "alex-id")
	joinGroupByInvitation(t, owner, decliner, group.GroupID, declinerID)

	soon := createEvent(t, owner, base, "Reminder target", time.Now().Add(30*time.Minute))
	far := createEvent(t, owner, base, "Not yet", time.Now().Add(4*time.Hour))
	past := insertEvent(t, repo, group.GroupID, "Already happened", time.Now().Add(-time.Hour))

	member.call("PUT", fmt.Sprintf("%s/events/%d/rsvp", base, soon.ID), map[string]string{"status": "going"}, 200)
	decliner.call("PUT", fmt.Sprintf("%s/events/%d/rsvp", base, soon.ID), map[string]string{"status": "not_going"}, 200)

	// Creating the events already told both members about them, so the sweep's
	// contribution is measured as a difference rather than as a total.
	groupEvents := func(client integrationClient) int {
		t.Helper()
		return decoded[notification.NotificationResponse](t, client.call("GET", "/api/v1/notifications?types=group_event", nil, 200)).TotalElements
	}
	memberBefore, declinerBefore, authorBefore := groupEvents(member), groupEvents(decliner), groupEvents(owner)

	result, err := handlers.HandlerCtx.SendEventReminders(time.Now().UTC(), handlers.EventReminderLead)
	if err != nil {
		t.Fatal(err)
	}
	if result.Events != 1 || result.Members != 1 {
		t.Fatalf("the sweep reported %+v, want one event and one member told", result)
	}

	if added := groupEvents(member) - memberBefore; added != 1 {
		t.Fatalf("the member who is going received %d reminders, want 1", added)
	}
	if added := groupEvents(decliner) - declinerBefore; added != 0 {
		t.Fatalf("the member who declined received %d reminders, want none", added)
	}
	if added := groupEvents(owner) - authorBefore; added != 0 {
		t.Fatalf("the event's author received %d reminders, want none", added)
	}
	// The reminder points at the group, like the new-event notification, because
	// the group is the id the group routes carry.
	newest := decoded[notification.NotificationResponse](t, member.call("GET", "/api/v1/notifications?types=group_event", nil, 200)).Notifications
	if len(newest) == 0 || newest[0].EntityId != group.GroupID || newest[0].ActorId != "dummy-id" {
		t.Fatalf("the newest group notification is not the reminder: %+v", newest)
	}

	// The second sweep is a no-op, and only the event inside the window was
	// stamped — the far one still has its reminder to come, and the past one never
	// gets one.
	again, err := handlers.HandlerCtx.SendEventReminders(time.Now().UTC(), handlers.EventReminderLead)
	if err != nil {
		t.Fatal(err)
	}
	if again.Events != 0 || again.Members != 0 {
		t.Fatalf("a second sweep reminded again: %+v", again)
	}
	if stamp := reminderStamp(t, repo, soon.ID); stamp == "" {
		t.Fatal("the reminded event was not stamped")
	}
	if stamp := reminderStamp(t, repo, far.ID); stamp != "" {
		t.Fatalf("an event outside the window was stamped: %q", stamp)
	}
	if stamp := reminderStamp(t, repo, past); stamp != "" {
		t.Fatalf("a past event was stamped: %q", stamp)
	}
}
