package repositories

import (
	"fmt"
	"strings"
	"time"
)

// Media rows are created by POST /api/v1/media and referenced by URL from the
// eight surfaces that can carry an upload: a post's or a comment's `imageUrls`
// array, a story, a private message, group content, an avatar, a cover photo and
// a group image. Nothing deletes them when the row that pointed at them goes
// away, so this query is what keeps the table (and the upload directory that
// mirrors it) from growing forever.
//
// Two deliberate details:
//
//   - `createdAt <= datetime('now', ?)` is a grace window. An upload happens
//     *before* the request that attaches it, so a file nobody has referenced yet
//     is normal for a moment; the window keeps the collector away from it.
//   - a story counts for as long as its row exists, expired or not. An expired
//     story is archived rather than gone — its author still opens it (see
//     CanViewMedia) — so its upload is not an orphan; deleting the story is what
//     releases it, the way deleting a post releases a post's photo.
const unreferencedMediaQuery = `
SELECT m.mediaId FROM media m
WHERE m.createdAt <= datetime('now', ?)
  AND NOT EXISTS (SELECT 1 FROM post p, json_each(p.imageUrls) image WHERE image.value = '/api/v1/media/' || m.mediaId)
  AND NOT EXISTS (SELECT 1 FROM comment c, json_each(c.imageUrls) image WHERE image.value = '/api/v1/media/' || m.mediaId)
  AND NOT EXISTS (SELECT 1 FROM story s WHERE s.mediaUrl = '/api/v1/media/' || m.mediaId)
  AND NOT EXISTS (SELECT 1 FROM message msg WHERE msg.mediaUrl = '/api/v1/media/' || m.mediaId)
  AND NOT EXISTS (SELECT 1 FROM groupContent gc WHERE gc.mediaUrl = '/api/v1/media/' || m.mediaId)
  AND NOT EXISTS (SELECT 1 FROM user u WHERE u.avatar = '/api/v1/media/' || m.mediaId OR u.coverPhoto = '/api/v1/media/' || m.mediaId)
  AND NOT EXISTS (SELECT 1 FROM socialGroup g WHERE g.imageUrl = '/api/v1/media/' || m.mediaId)
`

// UnreferencedMedia lists uploads that no live row points at and that are older
// than grace. A zero grace is only useful for tests; production passes hours.
func (db *DB) UnreferencedMedia(grace time.Duration) ([]string, error) {
	seconds := int64(grace / time.Second)
	if seconds < 0 {
		seconds = 0
	}
	return db.stringList(unreferencedMediaQuery, fmt.Sprintf("-%d seconds", seconds))
}

// AllMediaIDs returns every id in the media table, for the file sweep that
// catches a file whose row is already gone (a failed unlink, a crash between the
// two steps).
func (db *DB) AllMediaIDs() ([]string, error) {
	return db.stringList("SELECT mediaId FROM media")
}

// DeleteMedia removes the given rows in one transaction and reports how many
// actually existed. The caller unlinks the file for every id it asked about: an
// id whose row had already gone either has no file left or leaves a stray that
// the file sweep removes, so two collectors racing can miss a file but never
// delete one a live row still points at.
func (db *DB) DeleteMedia(ids []string) (int, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	tx, err := db.Conn.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	result, err := tx.Exec("DELETE FROM media WHERE mediaId IN ("+placeholders+")", args...)
	if err != nil {
		return 0, err
	}
	deleted, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}
	return int(deleted), tx.Commit()
}
