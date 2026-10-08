package repositories

import (
	"fmt"
	"strings"
	"time"
)

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

func (db *DB) UnreferencedMedia(grace time.Duration) ([]string, error) {
	seconds := int64(grace / time.Second)
	if seconds < 0 {
		seconds = 0
	}
	return db.stringList(unreferencedMediaQuery, fmt.Sprintf("-%d seconds", seconds))
}

func (db *DB) AllMediaIDs() ([]string, error) {
	return db.stringList("SELECT mediaId FROM media")
}

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
