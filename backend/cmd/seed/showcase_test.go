package main

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"social-network/backend/pkg/app/repositories"
	sqlitedb "social-network/backend/pkg/db/sqlite"
)

func seedTestShowcase(t *testing.T) (*repositories.DB, string) {
	t.Helper()
	database, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	database.SetMaxOpenConns(1)
	t.Cleanup(func() { database.Close() })
	if err := sqlitedb.RunMigrations(database); err != nil {
		t.Fatal(err)
	}
	repo := &repositories.DB{Conn: database}
	if _, _, err := seedDummyUser(repo); err != nil {
		t.Fatal(err)
	}
	if _, _, err := seedUser(repo, "alex@example.com", "alexdemo", "Alex", "Demo"); err != nil {
		t.Fatal(err)
	}
	uploads := t.TempDir()
	if err := seedShowcase(repo, uploads); err != nil {
		t.Fatalf("seed showcase: %v", err)
	}
	return repo, uploads
}

func rowCount(t *testing.T, repo *repositories.DB, query string, args ...any) int {
	t.Helper()
	var n int
	if err := repo.Conn.QueryRow(query, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	return n
}

func snapshot(t *testing.T, repo *repositories.DB) string {
	t.Helper()
	tables := []string{
		"user", "post", "comment", "reaction", "follow", "connection", "media", "story", "storyView",
		"storyReply", "socialGroup", "socialGroupMember", "groupContent", "groupRSVP", "message",
		"notification", "savedPost", "post_selected_follower",
	}
	var b strings.Builder
	for _, table := range tables {
		fmt.Fprintf(&b, "%s=%d;", table, rowCount(t, repo, "SELECT COUNT(*) FROM "+table))
	}
	return b.String()
}

func TestShowcaseSeed(t *testing.T) {
	repo, uploads := seedTestShowcase(t)

	if got, want := rowCount(t, repo, "SELECT COUNT(*) FROM user"), len(showcaseMembers)+2; got != want {
		t.Fatalf("users = %d, want %d", got, want)
	}
	if got, want := rowCount(t, repo, "SELECT COUNT(*) FROM post"), len(showcasePosts); got != want {
		t.Fatalf("posts = %d, want %d", got, want)
	}
	if got := rowCount(t, repo, "SELECT COUNT(*) FROM post WHERE publicId = ''"); got != 0 {
		t.Fatalf("%d seeded posts have no public id", got)
	}
	if got, want := rowCount(t, repo, "SELECT COUNT(DISTINCT publicId) FROM post"), len(showcasePosts); got != want {
		t.Fatalf("distinct public ids = %d, want %d", got, want)
	}
	wantComments := 0
	for _, p := range showcasePosts {
		wantComments += len(p.Comments)
	}
	if got := rowCount(t, repo, "SELECT COUNT(*) FROM comment"); got != wantComments {
		t.Fatalf("comments = %d, want %d", got, wantComments)
	}
	if got := rowCount(t, repo, "SELECT COUNT(*) FROM comment WHERE imageUrls LIKE '%data:image/svg%'"); got < 1 {
		t.Fatal("no inline svg comment attachments were written")
	}
	if got := rowCount(t, repo, "SELECT COUNT(*) FROM post WHERE imageUrls <> '[]'"); got == 0 {
		t.Fatal("no post carries a picture")
	}
	if got, want := rowCount(t, repo, "SELECT COUNT(*) FROM socialGroup"), len(showcaseGroups); got != want {
		t.Fatalf("groups = %d, want %d", got, want)
	}
	if got := rowCount(t, repo, "SELECT COUNT(*) FROM story WHERE expiresAt > datetime('now')"); got == 0 {
		t.Fatal("no live stories were written")
	}
	if got := rowCount(t, repo, "SELECT COUNT(*) FROM follow"); got == 0 {
		t.Fatal("no follows were written")
	}
	if got := rowCount(t, repo, "SELECT COUNT(*) FROM notification WHERE userId = (SELECT userId FROM user WHERE email = 'dummy@example.com')"); got == 0 {
		t.Fatal("the demo account has no notifications")
	}

	rows, err := repo.Conn.Query("SELECT mediaId FROM media")
	if err != nil {
		t.Fatal(err)
	}
	var mediaIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		mediaIDs = append(mediaIDs, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(mediaIDs) == 0 {
		t.Fatal("no media rows were written")
	}
	for _, id := range mediaIDs {
		if _, err := os.Stat(filepath.Join(uploads, id)); err != nil {
			t.Fatalf("media %s has no file behind it: %v", id, err)
		}
	}

	dummyID, _, err := repo.GetUserCredentials("dummy@example.com")
	if err != nil {
		t.Fatal(err)
	}
	suggestions, err := repo.Suggestions(dummyID, 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(suggestions) < 5 {
		t.Fatalf("suggestions = %d, want at least 5", len(suggestions))
	}
	if suggestions[0].MutualCount < 1 {
		t.Fatalf("the top suggestion has no mutuals: %+v", suggestions[0])
	}

	before := snapshot(t, repo)
	if err := seedShowcase(repo, uploads); err != nil {
		t.Fatalf("second run: %v", err)
	}
	if after := snapshot(t, repo); before != after {
		t.Fatalf("re-running changed the dataset:\n before %s\n after  %s", before, after)
	}
}
