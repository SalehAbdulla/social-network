package repositories

import (
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"

	backend "social-network/backend"
	sqlitedb "social-network/backend/pkg/db/sqlite"
	"social-network/backend/pkg/models"
)

const mediaPrefix = "/api/v1/media/"

// testRepo migrates a scratch database and seeds the three accounts the
// visibility rules need. The subject here is SQL, so the fixture writes rows
// directly rather than driving the services above it.
func testRepo(t *testing.T) *DB {
	t.Helper()
	database, err := sql.Open("sqlite3", filepath.Join(t.TempDir(), "repo.db")+"?_foreign_keys=on&_busy_timeout=5000")
	if err != nil {
		t.Fatal(err)
	}
	database.SetMaxOpenConns(1)
	t.Cleanup(func() { database.Close() })
	if err := sqlitedb.RunMigrations(database); err != nil {
		t.Fatal(err)
	}
	db := &DB{Conn: database}
	for _, account := range []struct{ id, nickname, email string }{
		{"owner-id", "owneruser", "owner@example.com"},
		{"viewer-id", "vieweruser", "viewer@example.com"},
		{"stranger-id", "strangeruser", "stranger@example.com"},
	} {
		if err := db.InsertUser(models.Registration{
			UserID: account.id, Nickname: account.nickname, FirstName: "Test", LastName: "User",
			Email: account.email, PasswordHash: "not-a-real-hash", BirthDate: "2000-01-01",
			BirthYear: 2000, Gender: "male", IsPublic: true,
		}); err != nil {
			t.Fatal(err)
		}
	}
	return db
}

// upload registers a media row and returns the URL other rows reference, which
// is all they store: the id is never a foreign key.
func upload(t *testing.T, db *DB, id, owner string) string {
	t.Helper()
	if err := db.AddMedia(id, owner, "image/png"); err != nil {
		t.Fatal(err)
	}
	return mediaPrefix + id
}

func jsonURL(url string) string { return fmt.Sprintf(`["%s"]`, url) }

func insertPost(t *testing.T, db *DB, owner, privacy, imageURLs string) int {
	t.Helper()
	result, err := db.Conn.Exec(`INSERT INTO post (publicId, userId, title, content, privacy, score, commentsCounter, imageUrls)
		VALUES (lower(hex(randomblob(16))), ?, 'A title', 'Content long enough to be a post.', ?, 0, 0, ?)`, owner, privacy, imageURLs)
	if err != nil {
		t.Fatal(err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	return int(id)
}

func insertComment(t *testing.T, db *DB, postID int, author, imageURLs string) {
	t.Helper()
	if _, err := db.Conn.Exec("INSERT INTO comment (postId, userId, content, imageUrls) VALUES (?, ?, 'A comment', ?)", postID, author, imageURLs); err != nil {
		t.Fatal(err)
	}
}

// orphans is the collector's query seen as a set, which is how the tests below
// compare one release against the next.
func orphans(t *testing.T, db *DB, grace time.Duration) map[string]bool {
	t.Helper()
	ids, err := db.UnreferencedMedia(grace)
	if err != nil {
		t.Fatal(err)
	}
	found := make(map[string]bool, len(ids))
	for _, id := range ids {
		found[id] = true
	}
	return found
}

func keys(set map[string]bool) []string {
	ids := make([]string, 0, len(set))
	for id := range set {
		ids = append(ids, id)
	}
	return ids
}

// TestUnreferencedMediaSpansEverySurface is the direct test for the query the
// media collector runs: a row survives while any one of the eight surfaces still
// points at it and becomes an orphan the moment the last reference goes. The
// grace window is asserted from both sides, because it is what keeps an upload
// that has not been attached yet safe.
func TestUnreferencedMediaSpansEverySurface(t *testing.T) {
	db := testRepo(t)
	ids := map[string]string{
		"post":       "11111111-1111-4111-8111-111111111101",
		"comment":    "11111111-1111-4111-8111-111111111102",
		"story":      "11111111-1111-4111-8111-111111111103",
		"message":    "11111111-1111-4111-8111-111111111104",
		"groupPost":  "11111111-1111-4111-8111-111111111105",
		"groupImage": "11111111-1111-4111-8111-111111111106",
		"avatar":     "11111111-1111-4111-8111-111111111107",
		"cover":      "11111111-1111-4111-8111-111111111108",
		"unattached": "11111111-1111-4111-8111-111111111109",
	}
	urls := map[string]string{}
	for name, id := range ids {
		urls[name] = upload(t, db, id, "owner-id")
	}

	postID := insertPost(t, db, "owner-id", "public", jsonURL(urls["post"]))
	// The comment gets its own post, so releasing the post below cannot be what
	// orphans the comment photo.
	insertComment(t, db, insertPost(t, db, "owner-id", "public", "[]"), "owner-id", jsonURL(urls["comment"]))
	if _, err := db.Conn.Exec(`INSERT INTO story (userId, mediaUrl, mediaType, expiresAt)
		VALUES ('owner-id', ?, 'image', datetime('now', '+24 hours'))`, urls["story"]); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Conn.Exec(`INSERT INTO message (senderId, recipientId, content, mediaUrl, mediaType)
		VALUES ('owner-id', 'viewer-id', 'A photo', ?, 'image')`, urls["message"]); err != nil {
		t.Fatal(err)
	}
	created, err := db.Conn.Exec(`INSERT INTO socialGroup (ownerId, title, description, imageUrl)
		VALUES ('owner-id', 'A group', 'A group for the test', ?)`, urls["groupImage"])
	if err != nil {
		t.Fatal(err)
	}
	groupID, err := created.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Conn.Exec(`INSERT INTO groupContent (groupId, userId, kind, content, mediaUrl)
		VALUES (?, 'owner-id', 'posts', 'Group content', ?)`, groupID, urls["groupPost"]); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Conn.Exec("UPDATE user SET avatar = ?, coverPhoto = ? WHERE userId = 'owner-id'", urls["avatar"], urls["cover"]); err != nil {
		t.Fatal(err)
	}

	if found := orphans(t, db, 0); len(found) != 1 || !found[ids["unattached"]] {
		t.Fatalf("expected only the unattached upload to be an orphan, found %v", found)
	}
	if found := orphans(t, db, time.Hour); len(found) != 0 {
		t.Fatalf("the grace window let a fresh upload through: %v", found)
	}

	// Releasing one reference at a time has to release exactly that upload.
	for _, step := range []struct {
		name   string
		key    string
		remove func()
	}{
		{"post", "post", func() { db.Conn.Exec("DELETE FROM post WHERE postId = ?", postID) }},
		{"comment", "comment", func() { db.Conn.Exec("DELETE FROM comment WHERE postId <> ?", postID) }},
		// Deleting the story is what releases its upload: an expired story is
		// still the author's archive, so expiry alone releases nothing.
		{"story", "story", func() { db.Conn.Exec("DELETE FROM story") }},
		{"message", "message", func() { db.Conn.Exec("DELETE FROM message") }},
		{"group post", "groupPost", func() { db.Conn.Exec("DELETE FROM groupContent WHERE groupId = ?", groupID) }},
		{"group image", "groupImage", func() { db.Conn.Exec("UPDATE socialGroup SET imageUrl = '' WHERE groupId = ?", groupID) }},
		{"avatar", "avatar", func() { db.Conn.Exec("UPDATE user SET avatar = '' WHERE userId = 'owner-id'") }},
		{"cover photo", "cover", func() { db.Conn.Exec("UPDATE user SET coverPhoto = '' WHERE userId = 'owner-id'") }},
	} {
		before := orphans(t, db, 0)
		step.remove()
		after := orphans(t, db, 0)
		if before[ids[step.key]] || !after[ids[step.key]] || len(after) != len(before)+1 {
			t.Fatalf("releasing the %s released %v, expected only %s", step.name, after, step.key)
		}
	}

	// With every reference gone the collector sees them all, and the delete
	// reports the rows it actually removed.
	released := orphans(t, db, 0)
	removed, err := db.DeleteMedia(keys(released))
	if err != nil {
		t.Fatal(err)
	}
	if removed != len(released) {
		t.Fatalf("deleted %d rows but reported %d", len(released), removed)
	}
	if found := orphans(t, db, 0); len(found) != 0 {
		t.Fatalf("orphans survived the delete: %v", found)
	}
}

// TestMediaVisibilityMirrorsItsReferenceAndAudience walks every branch of the
// media access rule directly. It is the read side of the same query the
// collector uses, and the two must stay in step: anything the collector calls an
// orphan is also something a stranger cannot read.
func TestMediaVisibilityMirrorsItsReferenceAndAudience(t *testing.T) {
	db := testRepo(t)
	urls := map[string]string{}
	for name, id := range map[string]string{
		"publicPost":  "22222222-2222-4222-8222-222222222201",
		"privatePost": "22222222-2222-4222-8222-222222222202",
		"comment":     "22222222-2222-4222-8222-222222222203",
		"avatar":      "22222222-2222-4222-8222-222222222204",
		"cover":       "22222222-2222-4222-8222-222222222205",
		"story":       "22222222-2222-4222-8222-222222222206",
		"message":     "22222222-2222-4222-8222-222222222207",
		"groupImage":  "22222222-2222-4222-8222-222222222208",
		"unattached":  "22222222-2222-4222-8222-222222222209",
	} {
		urls[name] = upload(t, db, id, "owner-id")
	}
	insertPost(t, db, "owner-id", "public", jsonURL(urls["publicPost"]))
	privatePost := insertPost(t, db, "owner-id", "followers", jsonURL(urls["privatePost"]))
	insertComment(t, db, privatePost, "owner-id", jsonURL(urls["comment"]))
	if _, err := db.Conn.Exec(`INSERT INTO story (userId, mediaUrl, mediaType, expiresAt)
		VALUES ('owner-id', ?, 'image', datetime('now', '+24 hours'))`, urls["story"]); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Conn.Exec(`INSERT INTO message (senderId, recipientId, content, mediaUrl, mediaType)
		VALUES ('owner-id', 'viewer-id', 'A photo', ?, 'image')`, urls["message"]); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Conn.Exec(`INSERT INTO socialGroup (ownerId, title, imageUrl) VALUES ('owner-id', 'A group', ?)`, urls["groupImage"]); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Conn.Exec("UPDATE user SET avatar = ?, coverPhoto = ? WHERE userId = 'owner-id'", urls["avatar"], urls["cover"]); err != nil {
		t.Fatal(err)
	}

	// The uploader always reaches their own upload, even one nothing points at;
	// a stranger reaches neither an unattached upload nor a photo on a
	// followers-only post, but does reach a public post's photo.
	for _, testCase := range []struct {
		name   string
		url    string
		viewer string
		want   bool
	}{
		{"the uploader reaches an unattached upload", urls["unattached"], "owner-id", true},
		{"a stranger does not reach an unattached upload", urls["unattached"], "stranger-id", false},
		{"a public post photo is readable", urls["publicPost"], "stranger-id", true},
		{"a followers-only post photo is not", urls["privatePost"], "stranger-id", false},
		{"its comment photo follows the post", urls["comment"], "stranger-id", false},
		{"an avatar is readable by any signed-in user", urls["avatar"], "stranger-id", true},
		{"a story is readable while it is live", urls["story"], "stranger-id", true},
		{"a message photo reaches its recipient", urls["message"], "viewer-id", true},
		{"but not a stranger", urls["message"], "stranger-id", false},
		{"a group image has no audience", urls["groupImage"], "stranger-id", true},
		{"a cover photo on a public profile is readable", urls["cover"], "stranger-id", true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			allowed, err := db.CanViewMedia(strings.TrimPrefix(testCase.url, mediaPrefix), testCase.viewer)
			if err != nil {
				t.Fatal(err)
			}
			if allowed != testCase.want {
				t.Fatalf("expected %v, got %v", testCase.want, allowed)
			}
		})
	}

	// A follow opens the followers-only post, its comment photo and a cover
	// photo on a profile that hides itself from strangers.
	if _, err := db.FollowUser("viewer-id", "owner-id"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Conn.Exec("UPDATE user SET isPublic = 0 WHERE userId = 'owner-id'"); err != nil {
		t.Fatal(err)
	}
	for _, testCase := range []struct {
		name   string
		url    string
		viewer string
		want   bool
	}{
		{"a follower reaches the post photo", urls["privatePost"], "viewer-id", true},
		{"and its comment photo", urls["comment"], "viewer-id", true},
		{"and the cover photo", urls["cover"], "viewer-id", true},
		{"a stranger still does not", urls["cover"], "stranger-id", false},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			allowed, err := db.CanViewMedia(strings.TrimPrefix(testCase.url, mediaPrefix), testCase.viewer)
			if err != nil {
				t.Fatal(err)
			}
			if allowed != testCase.want {
				t.Fatalf("expected %v, got %v", testCase.want, allowed)
			}
		})
	}

	// An expired story can never be served again, which is what lets the
	// collector take its upload.
	if _, err := db.Conn.Exec("UPDATE story SET expiresAt = datetime('now', '-1 minute')"); err != nil {
		t.Fatal(err)
	}
	if allowed, err := db.CanViewMedia(strings.TrimPrefix(urls["story"], mediaPrefix), "stranger-id"); err != nil || allowed {
		t.Fatalf("an expired story is still readable (%v, %v)", allowed, err)
	}
}

// TestChatRuleAndSelectedAudience pins the two rules the chat and the "selected"
// audience depend on: a private message needs a follow in either direction or a
// public recipient, and a selected audience may only name people who follow the
// author.
func TestChatRuleAndSelectedAudience(t *testing.T) {
	db := testRepo(t)

	// A public profile is reachable by anyone, yourself is not a target at all,
	// and a missing account is not found rather than forbidden.
	if allowed, err := db.CanMessage("stranger-id", "owner-id"); err != nil || !allowed {
		t.Fatalf("a public profile must be messageable (%v, %v)", allowed, err)
	}
	if allowed, err := db.CanMessage("owner-id", "owner-id"); err != nil || allowed {
		t.Fatalf("messaging yourself must not be allowed (%v, %v)", allowed, err)
	}
	if _, err := db.CanMessage("stranger-id", "missing-id"); !errors.Is(err, backend.ErrNotFound) {
		t.Fatalf("expected a not-found target, got %v", err)
	}

	// Hide the profile: a follow is required now, in either direction.
	if _, err := db.Conn.Exec("UPDATE user SET isPublic = 0 WHERE userId = 'owner-id'"); err != nil {
		t.Fatal(err)
	}
	if allowed, _ := db.CanMessage("stranger-id", "owner-id"); allowed {
		t.Fatal("a stranger reached a private profile")
	}
	if allowed, _ := db.CanMessage("owner-id", "stranger-id"); !allowed {
		t.Fatal("the private owner could not reach a public profile")
	}
	if visible, err := db.CanViewPrivateProfile("stranger-id", "owner-id"); err != nil || visible {
		t.Fatalf("a stranger could view a private profile (%v, %v)", visible, err)
	}
	if visible, _ := db.CanViewPrivateProfile("owner-id", "owner-id"); !visible {
		t.Fatal("a profile owner could not view their own profile")
	}

	// A follow request that is still pending changes nothing.
	if status, err := db.FollowUser("stranger-id", "owner-id"); err != nil || status != "pending" {
		t.Fatalf("following a private profile should be pending (%q, %v)", status, err)
	}
	if allowed, _ := db.CanMessage("stranger-id", "owner-id"); allowed {
		t.Fatal("a pending request opened the chat")
	}
	if err := db.DecideFollowRequest("owner-id", "stranger-id", true); err != nil {
		t.Fatal(err)
	}
	if allowed, _ := db.CanMessage("stranger-id", "owner-id"); !allowed {
		t.Fatal("an accepted follow did not open the chat")
	}
	if visible, _ := db.CanViewPrivateProfile("stranger-id", "owner-id"); !visible {
		t.Fatal("an accepted follow did not open the profile")
	}

	// A selected audience may only name followers of the author, and an empty
	// one is valid.
	if err := db.ValidateSelectedFollowers("owner-id", []string{"viewer-id"}); !errors.Is(err, backend.ErrBadRequest) {
		t.Fatalf("a non-follower was accepted as a selected audience: %v", err)
	}
	if err := db.ValidateSelectedFollowers("owner-id", nil); err != nil {
		t.Fatalf("an empty audience should be valid, got %v", err)
	}
	if _, err := db.FollowUser("viewer-id", "owner-id"); err != nil {
		t.Fatal(err)
	}
	if err := db.DecideFollowRequest("owner-id", "viewer-id", true); err != nil {
		t.Fatal(err)
	}
	if err := db.ValidateSelectedFollowers("owner-id", []string{"viewer-id"}); err != nil {
		t.Fatalf("a follower was refused as a selected audience: %v", err)
	}
}
