package repositories

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"

	sqlitedb "social-network/backend/pkg/db/sqlite"
)

// The fixtures this file measures against. The counts are large enough that an index
// changes the wall clock as well as the plan text, and small enough that seeding them
// takes a fraction of a second inside one transaction.
//
// The plans themselves do not depend on size: this database never runs ANALYZE, and
// neither does the app, so SQLite plans from its own default estimates rather than
// from statistics. That is why a plan assertion here is stable, and why the timings
// are printed for information rather than asserted on — a wall clock is not a
// contract, and a test that fails on a noisy one teaches people to ignore it.
const (
	planViewer        = "user-000"
	planUsers         = 900
	planPosts         = 3000
	planComments      = 3000
	planReactions     = 9000
	planNotifications = 3000
	planConnections   = 800
	planMessages      = 2400
)

// planRepo migrates a scratch database and fills it with the shape the feed sees: one
// viewer, a third of the accounts followed, posts from a few dozen authors in mixed
// privacy, and enough dependent rows that the reads below have work to do.
func planRepo(t *testing.T) *DB {
	t.Helper()
	database, err := sql.Open("sqlite3", filepath.Join(t.TempDir(), "plans.db")+"?_foreign_keys=on&_busy_timeout=5000")
	if err != nil {
		t.Fatal(err)
	}
	database.SetMaxOpenConns(1)
	t.Cleanup(func() { database.Close() })
	if err := sqlitedb.RunMigrations(database); err != nil {
		t.Fatal(err)
	}
	db := &DB{Conn: database}

	tx, err := database.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback() }()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := tx.Exec(query, args...); err != nil {
			t.Fatalf("%v: %s", err, query)
		}
	}
	account := func(index int) string { return fmt.Sprintf("user-%03d", index) }

	for index := 0; index < planUsers; index++ {
		exec(`INSERT INTO user (userId, email, password, firstName, lastName, nickName, birthYear, gender, isPublic, birthDate)
			VALUES (?,?,?,?,?,?,?,?,?,?)`,
			account(index), account(index)+"@example.com", "hash", "First", "Last",
			"nick"+account(index), 2000, "male", index%3, "2000-01-01")
	}
	// The viewer follows a third of the accounts and a third follow the viewer, so the
	// visibility fragment has a follow to look up for every candidate post.
	for index := 1; index <= planUsers/3; index++ {
		exec(`INSERT INTO follow (followerId, followedId) VALUES (?,?)`, planViewer, account(index))
		exec(`INSERT INTO follow (followerId, followedId) VALUES (?,?)`, account(index), planViewer)
	}
	privacy := []string{"public", "followers", "selected"}
	for index := 0; index < planPosts; index++ {
		exec(`INSERT INTO post (userId, title, content, privacy, score, commentsCounter, createdAt, imageUrls)
			VALUES (?,?,?,?,?,?,?,?)`,
			account(1+index%40), fmt.Sprintf("Post %d", index), fmt.Sprintf("Body %d", index),
			privacy[index%len(privacy)], index%50, index%7,
			fmt.Sprintf("2026-09-%02d %02d:%02d:%02d", 1+index%28, index%24, index%60, index%60), "[]")
	}
	for index := 0; index < planComments; index++ {
		exec(`INSERT INTO comment (postId, userId, content, score, createdAt, imageUrls) VALUES (?,?,?,?,?,?)`,
			1+index%planPosts, account(1+index%40), fmt.Sprintf("Comment %d", index), index%5,
			fmt.Sprintf("2026-09-%02d %02d:00:00", 1+index%28, index%24), "[]")
	}
	for index := 0; index < planReactions; index++ {
		exec(`INSERT INTO reaction (userId, entityType, entityId, score) VALUES (?,?,?,?)`,
			account(index%planUsers), "post", 1+index%planPosts, []int{1, -1}[index%2])
	}
	for index := 0; index < planNotifications; index++ {
		kind := []string{"comment", "follow_request", "message", "group_event"}[index%4]
		// Spread across the accounts for the same reason as the connections below: with
		// every row belonging to the viewer, a userId filter would remove nothing and the
		// scan would look as fast as the index.
		exec(`INSERT INTO notification (userId, actorId, entityType, entityId, message, isRead, createdAt) VALUES (?,?,?,?,?,?,?)`,
			account(index%planUsers), account(1+index%40), kind, 1+index%planPosts, "A notification", index%2,
			fmt.Sprintf("2026-09-%02d 12:00:00", 1+index%28))
	}
	for index := 0; index < planConnections; index++ {
		// The requests are spread across accounts so the recipientId filter is selective,
		// which is the property the follow-request index exists for.
		exec(`INSERT INTO connection (requesterId, recipientId, status, createdAt) VALUES (?,?,?,?)`,
			account(100+index), account(index%planUsers), []string{"pending", "accepted"}[index%2],
			fmt.Sprintf("2026-09-%02d 09:00:00", 1+index%28))
	}
	for index := 0; index < planMessages; index++ {
		sender, recipient := planViewer, account(1+index%40)
		if index%2 == 0 {
			sender, recipient = recipient, planViewer
		}
		exec(`INSERT INTO message (senderId, recipientId, content, isRead, createdAt) VALUES (?,?,?,?,?)`,
			sender, recipient, fmt.Sprintf("Message %d", index), index%2,
			fmt.Sprintf("2026-09-%02d 18:%02d:00", 1+index%28, index%60))
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	return db
}

// explain returns SQLite's plan for one query, joined into the lines a reader sees.
func explain(t *testing.T, db *DB, query string, args ...any) string {
	t.Helper()
	rows, err := db.Conn.Query("EXPLAIN QUERY PLAN "+query, args...)
	if err != nil {
		t.Fatalf("explain %q: %v", query, err)
	}
	defer rows.Close()
	var plan []string
	for rows.Next() {
		var id, parent, notUsed int
		var detail string
		if err := rows.Scan(&id, &parent, &notUsed, &detail); err != nil {
			t.Fatal(err)
		}
		plan = append(plan, detail)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return strings.Join(plan, "\n")
}

// timeQuery warms the page cache with one run and reports the median of five, which
// is the number worth quoting when comparing an index against a scan.
func timeQuery(t *testing.T, db *DB, query string, args ...any) time.Duration {
	t.Helper()
	run := func() time.Duration {
		start := time.Now()
		rows, err := db.Conn.Query(query, args...)
		if err != nil {
			t.Fatalf("run %q: %v", query, err)
		}
		for rows.Next() {
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		rows.Close()
		return time.Since(start)
	}
	run()
	times := make([]time.Duration, 5)
	for index := range times {
		times[index] = run()
	}
	for i := 1; i < len(times); i++ {
		for j := i; j > 0 && times[j] < times[j-1]; j-- {
			times[j], times[j-1] = times[j-1], times[j]
		}
	}
	return times[len(times)/2]
}

// planCases is every read path this review covers, with the arguments the app passes and
// the index that path is expected to use. The queries are the app's own text: the
// visibility fragment, the feed's projection and the follow-request query are the
// constants the repositories use, so a plan asserted here cannot describe a query the app
// no longer runs.
//
// An empty `index` means no index is claimed for that query. The feed count and the chat
// list are the two: a count of every visible post has to visit every post, and the chat
// list already uses `message_conversation` through SQLite's multi-index OR, which was
// measured rather than assumed.
func planCases() []struct {
	name  string
	query string
	args  []any
	index string
} {
	viewer := planViewer
	visible := []any{viewer, viewer, viewer, viewer}
	withTail := func(head []any, tail ...any) []any { return append(append([]any{}, head...), tail...) }
	return []struct {
		name  string
		query string
		args  []any
		index string
	}{
		{
			"feed count",
			"SELECT COUNT(*) FROM post p WHERE " + postVisibility,
			visible,
			"",
		},
		{
			"feed page",
			postFeedSelect + postVisibility + "\n\t\tORDER BY p.createdAt DESC\n\t\tLIMIT 10 OFFSET 0",
			withTail(visible, 10, 0),
			"post_createdAt",
		},
		{
			"profile posts",
			"SELECT CAST(p.postId AS TEXT) FROM post p WHERE p.userId=? AND " + postVisibility +
				" ORDER BY p.createdAt DESC, p.postId DESC LIMIT 20 OFFSET 0",
			withTail([]any{viewer}, withTail(visible, 20, 0)...),
			"post_userId_createdAt",
		},
		{
			"likes tab",
			"SELECT CAST(p.postId AS TEXT) FROM post p JOIN reaction r ON r.entityType='post' AND r.entityId=p.postId" +
				" WHERE r.userId=? AND r.score=1 AND p.userId=? AND " + postVisibility +
				" ORDER BY p.createdAt DESC, p.postId DESC LIMIT 20 OFFSET 0",
			withTail([]any{viewer, viewer}, withTail(visible, 20, 0)...),
			"post_userId_createdAt",
		},
		{
			"comment count",
			"SELECT COUNT(*) FROM comment WHERE postId = ?",
			[]any{1},
			"comment_postId_createdAt",
		},
		{
			"comment page",
			commentPageSelect + "c.createdAt DESC\n\t\tLIMIT ? OFFSET ?",
			[]any{viewer, 1, 10, 0},
			"comment_postId_createdAt",
		},
		{
			"notification unread count",
			"SELECT COUNT(*) FROM notification WHERE entityType IN ('comment','follow_request') AND userId = ? AND isRead = 0",
			[]any{viewer},
			"notification_userId_isRead",
		},
		{
			"notification page",
			notificationPageSelect + "n.entityType IN ('comment','follow_request') AND n.userId = ? ORDER BY n.createdAt DESC LIMIT ? OFFSET ?",
			[]any{viewer, 20, 0},
			"notification_userId_isRead",
		},
		{
			"follow requests",
			followRequestsQuery,
			[]any{viewer, 0},
			"connection_recipient_status",
		},
		{
			"chat users",
			chatUsersQuery,
			[]any{viewer, viewer, viewer, viewer, viewer, viewer},
			"message_conversation",
		},
		{
			"reaction total",
			"SELECT COALESCE(SUM(score), 0) FROM reaction WHERE entityType = ? AND entityId = ?",
			[]any{"post", 1},
			"reaction_entityType_entityId",
		},
	}
}

// oneLine is how a plan is quoted in a log line or in the session notes.
func oneLine(plan string) string {
	return strings.Join(strings.Fields(strings.ReplaceAll(plan, "\n", " | ")), " ")
}

// migrationIndexes reads the CREATE INDEX statements out of migration 000013, so the
// counterfactual below restores an index with the same text that created it: the migration
// stays the one source for both, and an index renamed there fails here by name instead of
// quietly measuring nothing.
func migrationIndexes(t *testing.T) map[string]string {
	t.Helper()
	path := filepath.Join("..", "..", "..", "pkg", "db", "migrations", "sqlite", "000013_query_indexes.up.sql")
	source, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("the migration this test is about must exist: %v", err)
	}
	statements := map[string]string{}
	pattern := regexp.MustCompile(`^CREATE INDEX IF NOT EXISTS (\w+) ON .*;$`)
	for _, line := range strings.Split(string(source), "\n") {
		line = strings.TrimSpace(line)
		if match := pattern.FindStringSubmatch(line); match != nil {
			statements[match[1]] = line
		}
	}
	if len(statements) == 0 {
		t.Fatalf("no CREATE INDEX statements were read out of %s", path)
	}
	return statements
}

// TestQueryPlansUseTheirIndex is the evidence for migration 000013, and it is two claims
// rather than one: the plan must use the index the migration creates, and dropping that
// index must change the plan — otherwise the index is not what the query leans on and the
// migration is decoration.
//
// The wall clock is logged rather than asserted, because it is not a contract, but it is
// the reason each index is there, and it is measured with and without the index in the
// same run so the two numbers can be compared.
func TestQueryPlansUseTheirIndex(t *testing.T) {
	if testing.Short() {
		t.Skip("seeds thousands of rows and drops indexes")
	}
	migration := migrationIndexes(t)
	db := planRepo(t)
	for _, testCase := range planCases() {
		if testCase.index == "" {
			continue
		}
		t.Run(testCase.name, func(t *testing.T) {
			withPlan := explain(t, db, testCase.query, testCase.args...)
			if !strings.Contains(withPlan, testCase.index) {
				t.Fatalf("%s does not use %s:\n%s", testCase.name, testCase.index, withPlan)
			}
			withTime := timeQuery(t, db, testCase.query, testCase.args...)
			statement, ours := migration[testCase.index]
			if !ours {
				// An index an earlier migration created — the chat list's — is asserted above
				// but not dropped here: this test only owns what 000013 created.
				t.Logf("plan uses %s: %s (median of five runs)", testCase.index, withTime)
				return
			}
			// The "without" number for `post_userId_createdAt` is the interesting one: by the
			// time this case runs, `post_createdAt` has been restored, so it measures the trap
			// the migration's comment describes — the feed's index in place, the author's
			// missing — rather than the plain scan it would be on its own. The cases run in
			// the order planCases lists them, and the plan assertion holds either way.
			if _, err := db.Conn.Exec("DROP INDEX " + testCase.index); err != nil {
				t.Fatal(err)
			}
			withoutPlan := explain(t, db, testCase.query, testCase.args...)
			withoutTime := timeQuery(t, db, testCase.query, testCase.args...)
			if strings.Contains(withoutPlan, testCase.index) {
				t.Fatalf("the plan still names %s after it was dropped, so this comparison proves nothing:\n%s", testCase.index, withoutPlan)
			}
			if _, err := db.Conn.Exec(statement); err != nil {
				t.Fatalf("restoring %s from the migration: %v", testCase.index, err)
			}
			if restored := explain(t, db, testCase.query, testCase.args...); !strings.Contains(restored, testCase.index) {
				t.Fatalf("%s is not used again after being restored:\n%s", testCase.index, restored)
			}
			t.Logf("with %s: %s, without it: %s\nwith: %s\nwithout: %s",
				testCase.index, withTime, withoutTime, oneLine(withPlan), oneLine(withoutPlan))
		})
	}
}

// TestPrintQueryPlans is the measurement this migration is decided by: it prints the
// plan and the wall clock for every read path under review, on the schema as it
// stands. It is a named test rather than a one-off so the before-and-after quoted in
// `TODO.md` can be reproduced with one command, and it asserts nothing — the
// assertions belong to the index test that follows.
func TestPrintQueryPlans(t *testing.T) {
	if testing.Short() {
		t.Skip("seeds thousands of rows")
	}
	db := planRepo(t)
	for _, testCase := range planCases() {
		t.Run(testCase.name, func(t *testing.T) {
			t.Logf("plan:\n%s", explain(t, db, testCase.query, testCase.args...))
			t.Logf("median of five runs: %s", timeQuery(t, db, testCase.query, testCase.args...))
		})
	}
}
