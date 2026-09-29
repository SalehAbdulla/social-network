package main

import (
	"fmt"
	"testing"

	"golang.org/x/crypto/bcrypt"

	"social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/models"
)

// A group list page is 30 rows plus one sentinel row that tells the client there
// is more, so the boundary this test pins is 31.
const groupPageRows = 31

// seedPagerAccounts creates accounts straight in the database. Registering them
// through the endpoint would cost a bcrypt hash each and would prove nothing
// about paging.
func seedPagerAccounts(t *testing.T, repo *repositories.DB, count int) []string {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte("DummyUser123!"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	ids := make([]string, 0, count)
	for i := 0; i < count; i++ {
		id := fmt.Sprintf("pager-%02d", i)
		if err := repo.InsertUser(models.Registration{
			UserID: id, Nickname: fmt.Sprintf("pager%02d", i),
			FirstName: "Pager", LastName: fmt.Sprintf("Number%02d", i),
			Email: fmt.Sprintf("pager%02d@example.com", i), PasswordHash: string(hash),
			BirthDate: "2000-01-01", BirthYear: 2000, Gender: "male", IsPublic: true,
		}); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	return ids
}

// addGroupRows links the accounts to a group. Every row is given the same
// timestamp on purpose: a page boundary over a sort that ties is exactly where
// LIMIT and OFFSET start repeating and skipping rows, so the tiebreaker in the
// ORDER BY is what this is checking.
func addGroupRows(t *testing.T, repo *repositories.DB, statement string, groupID int, ids []string) {
	t.Helper()
	for _, id := range ids {
		if _, err := repo.Conn.Exec(statement, groupID, id); err != nil {
			t.Fatal(err)
		}
	}
}

// TestGroupMembersAndRequestsPaginate covers the two lists that used to be
// fetched whole: the first page has to stop at the sentinel row, the second has
// to continue without repeating anything, the two together have to cover
// everybody exactly once, and paging must not become a way around the
// authorization checks.
func TestGroupMembersAndRequestsPaginate(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner := newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	group := decoded[models.Group](t, owner.call("POST", "/api/v1/groups", map[string]string{
		"title": "Paged group", "description": "More members than one page holds",
	}, 201))
	base := fmt.Sprintf("/api/v1/groups/%d", group.GroupID)

	ids := seedPagerAccounts(t, repo, 40)
	addGroupRows(t, repo, "INSERT INTO socialGroupMember (groupId,userId,joinedAt) VALUES (?,?,'2026-01-01 00:00:00')", group.GroupID, ids)
	addGroupRows(t, repo, "INSERT INTO socialGroupRequest (groupId,userId,createdAt) VALUES (?,?,'2026-01-01 00:00:00')", group.GroupID, ids)

	// Neither a member nor the owner, so the checks have something to refuse.
	outsider := newIntegrationClient(t, server)
	outsider.login("alex@example.com")

	// 41 members over two pages: 31 rows, then the remaining 11 minus the one the
	// sentinel overlapped.
	firstPage := decoded[[]models.GroupMember](t, owner.call("GET", base+"/members?offset=0", nil, 200))
	if len(firstPage) != groupPageRows {
		t.Fatalf("first member page returned %d rows, want %d", len(firstPage), groupPageRows)
	}
	if firstPage[0].Role != "owner" {
		t.Fatalf("the owner must lead the member list: %+v", firstPage[0])
	}
	secondPage := decoded[[]models.GroupMember](t, owner.call("GET", base+"/members?offset=30", nil, 200))
	if len(secondPage) == 0 || len(secondPage) >= groupPageRows {
		t.Fatalf("second member page returned %d rows, want a short tail", len(secondPage))
	}
	// The two pages overlap on exactly the sentinel row — the last row of the
	// first page is the first row of the second — which is what the client's
	// de-duplication exists for. So the union is asserted, not the row count: a
	// sort without a total order would repeat other rows or drop them.
	members := map[string]bool{}
	rows := 0
	for _, member := range append(firstPage, secondPage...) {
		members[member.UserID] = true
		rows++
	}
	if rows-len(members) != 1 {
		t.Fatalf("expected only the sentinel row to repeat, %d rows yielded %d accounts", rows, len(members))
	}
	if len(members) != 41 {
		t.Fatalf("the two member pages cover %d accounts, want 41", len(members))
	}
	if !members["dummy-id"] {
		t.Fatal("the owner is missing from the member pages")
	}
	for _, id := range ids {
		if !members[id] {
			t.Fatalf("member %s is missing from the two pages", id)
		}
	}

	// Requests behave the same way, and the pages have to cover every pending
	// request exactly once.
	requestsFirst := decoded[[]models.GroupRequest](t, owner.call("GET", base+"/requests?offset=0", nil, 200))
	if len(requestsFirst) != groupPageRows {
		t.Fatalf("first request page returned %d rows, want %d", len(requestsFirst), groupPageRows)
	}
	requestsSecond := decoded[[]models.GroupRequest](t, owner.call("GET", base+"/requests?offset=30", nil, 200))
	if len(requestsSecond) == 0 || len(requestsSecond) >= groupPageRows {
		t.Fatalf("second request page returned %d rows, want a short tail", len(requestsSecond))
	}
	requests := map[int]bool{}
	requestRows := 0
	for _, request := range append(requestsFirst, requestsSecond...) {
		requests[request.RequestID] = true
		requestRows++
	}
	if requestRows-len(requests) != 1 {
		t.Fatalf("expected only the sentinel row to repeat, %d rows yielded %d requests", requestRows, len(requests))
	}
	if len(requests) != 40 {
		t.Fatalf("the two request pages cover %d requests, want 40", len(requests))
	}

	// Paging is not a way around the rules, and the offset is validated rather
	// than handed to SQL.
	outsider.call("GET", base+"/members?offset=30", nil, 403)
	outsider.call("GET", base+"/requests?offset=30", nil, 403)
	owner.call("GET", base+"/members?offset=-1", nil, 400)
	owner.call("GET", base+"/requests?offset=abc", nil, 400)
}
