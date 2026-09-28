package sqlite

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/sqlite3"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	_ "github.com/mattn/go-sqlite3"

	"social-network/backend/pkg/config"
)

// TestMigrationsRoundTrip runs every migration up, all the way down and up
// again on a scratch database, so a broken down file cannot reach a release.
func TestMigrationsRoundTrip(t *testing.T) {
	backendDir, err := config.BackendDir()
	if err != nil {
		t.Fatal(err)
	}
	database, err := sql.Open("sqlite3", filepath.Join(t.TempDir(), "roundtrip.db")+"?_foreign_keys=on&_busy_timeout=5000")
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	database.SetMaxOpenConns(1)

	source, err := iofs.New(os.DirFS(filepath.Join(backendDir, "pkg", "db", "migrations", "sqlite")), ".")
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	driver, err := sqlite3.WithInstance(database, &sqlite3.Config{})
	if err != nil {
		t.Fatal(err)
	}
	migrations, err := migrate.NewWithInstance("iofs", source, "sqlite3", driver)
	if err != nil {
		t.Fatal(err)
	}

	if err := migrations.Up(); err != nil {
		t.Fatalf("initial up: %v", err)
	}
	assertSessionColumns(t, database, true)
	assertCommentColumns(t, database)

	if err := migrations.Down(); err != nil {
		t.Fatalf("down: %v", err)
	}
	for _, table := range []string{"user", "session", "post", "comment", "message", "notification", "media", "follow", "connection", "story", "socialGroup", "groupContent"} {
		if tableExists(t, database, table) {
			t.Fatalf("table %q survived a full down migration", table)
		}
	}

	if err := migrations.Up(); err != nil {
		t.Fatalf("second up: %v", err)
	}
	assertSessionColumns(t, database, true)
	assertCommentColumns(t, database)
	version, dirty, err := migrations.Version()
	if err != nil || dirty || version != 10 {
		t.Fatalf("expected clean version 10, got %d (dirty=%v, err=%v)", version, dirty, err)
	}
}

// TestSessionLifecycleKeepsExistingRows checks that the session rebuild in
// 000009 carries existing tokens over instead of dropping them.
func TestSessionLifecycleKeepsExistingRows(t *testing.T) {
	backendDir, err := config.BackendDir()
	if err != nil {
		t.Fatal(err)
	}
	database, err := sql.Open("sqlite3", filepath.Join(t.TempDir(), "session.db")+"?_foreign_keys=on&_busy_timeout=5000")
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	database.SetMaxOpenConns(1)

	// Only the first eight migrations, so the session table is still the
	// original three-column shape.
	source, err := iofs.New(os.DirFS(filepath.Join(backendDir, "pkg", "db", "migrations", "sqlite")), ".")
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	driver, err := sqlite3.WithInstance(database, &sqlite3.Config{})
	if err != nil {
		t.Fatal(err)
	}
	migrations, err := migrate.NewWithInstance("iofs", source, "sqlite3", driver)
	if err != nil {
		t.Fatal(err)
	}
	if err := migrations.Migrate(8); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec("INSERT INTO user (userId, email, password, firstName, lastName, nickName, birthYear, gender) VALUES ('u1','u1@example.com','hash','U','One','uone',2000,'male')"); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec("INSERT INTO session (token, userId, expiresAt) VALUES ('legacy-token','u1','2099-01-01 00:00:00')"); err != nil {
		t.Fatal(err)
	}

	if err := migrations.Up(); err != nil {
		t.Fatal(err)
	}
	var userID string
	if err := database.QueryRow("SELECT userId FROM session WHERE token='legacy-token'").Scan(&userID); err != nil {
		t.Fatalf("legacy session row was dropped: %v", err)
	}
	if userID != "u1" {
		t.Fatalf("legacy session row lost its owner: %q", userID)
	}
	// The cascade still applies to the rebuilt table.
	if _, err := database.Exec("DELETE FROM user WHERE userId='u1'"); err != nil {
		t.Fatal(err)
	}
	var remaining int
	if err := database.QueryRow("SELECT COUNT(*) FROM session").Scan(&remaining); err != nil {
		t.Fatal(err)
	}
	if remaining != 0 {
		t.Fatal("deleting a user left their session rows behind")
	}
}

func assertSessionColumns(t *testing.T, database *sql.DB, wantLifecycle bool) {
	t.Helper()
	columns := tableColumns(t, database, "session")
	for _, name := range []string{"token", "userId", "expiresAt"} {
		if !columns[name] {
			t.Fatalf("session is missing %q after the migration", name)
		}
	}
	for _, name := range []string{"createdAt", "lastSeenAt"} {
		if columns[name] != wantLifecycle {
			t.Fatalf("session column %q presence = %v, want %v", name, columns[name], wantLifecycle)
		}
	}
}

// assertCommentColumns guards the media column added by 000010.
func assertCommentColumns(t *testing.T, database *sql.DB) {
	t.Helper()
	columns := tableColumns(t, database, "comment")
	for _, name := range []string{"commentId", "postId", "userId", "content", "imageUrls"} {
		if !columns[name] {
			t.Fatalf("comment is missing %q after the migration", name)
		}
	}
}

func tableColumns(t *testing.T, database *sql.DB, table string) map[string]bool {
	t.Helper()
	columns := map[string]bool{}
	rows, err := database.Query("PRAGMA table_info(" + table + ")")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, columnType string
		var notNull, primaryKey int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			t.Fatal(err)
		}
		columns[name] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return columns
}

func tableExists(t *testing.T, database *sql.DB, table string) bool {
	t.Helper()
	var count int
	err := database.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&count)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false
		}
		t.Fatal(err)
	}
	return count > 0
}
