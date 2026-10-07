package repositories

import (
	"strings"

	"social-network/backend/pkg/models"
)

// The bookmark methods are gathered in this file rather than spread through
// PostRepository.go, so the saved list and the three queries behind it can be
// read together. They are declared on the PostRepository interface (see that
// file for why) and the visibility fragment they share lives there too.

// SavePost records that one account bookmarked one post. It is idempotent: the
// pair is the table's primary key, so the conflicting insert is dropped and the
// endpoint can report the resulting state instead of a conflict.
func (db *DB) SavePost(userID string, postID int) error {
	_, err := db.Conn.Exec(
		"INSERT INTO savedPost (userId, postId) VALUES (?, ?) ON CONFLICT(userId, postId) DO NOTHING",
		userID, postID,
	)
	return err
}

// UnsavePost removes a bookmark. Removing one that is not there is not an error,
// for the same reason saving twice is not: the caller named a state, not a change.
func (db *DB) UnsavePost(userID string, postID int) error {
	_, err := db.Conn.Exec("DELETE FROM savedPost WHERE userId = ? AND postId = ?", userID, postID)
	return err
}

func (db *DB) IsPostSaved(userID string, postID int) (bool, error) {
	var saved bool
	err := db.Conn.QueryRow(
		"SELECT EXISTS(SELECT 1 FROM savedPost WHERE userId = ? AND postId = ?)",
		userID, postID,
	).Scan(&saved)
	return saved, err
}

// SavedPostIDs answers, for one viewer, which of postIDs are bookmarked, in a
// single query. The feed decorates a whole page with it: asking once per post
// would be N queries for a flag that is only ever a boolean.
func (db *DB) SavedPostIDs(userID string, postIDs []int) (map[int]bool, error) {
	saved := make(map[int]bool, len(postIDs))
	if len(postIDs) == 0 {
		return saved, nil
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(postIDs)), ",")
	args := make([]any, 0, len(postIDs)+1)
	args = append(args, userID)
	for _, id := range postIDs {
		args = append(args, id)
	}
	rows, err := db.Conn.Query("SELECT postId FROM savedPost WHERE userId = ? AND postId IN ("+placeholders+")", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		saved[id] = true
	}
	return saved, rows.Err()
}

// SavedPosts is one page of an account's bookmarks, newest saved first, filtered
// by the same visibility fragment the feed uses — so a post that becomes
// unreadable (the author turns private, the viewer unfollows) drops out of the
// list instead of becoming a back door to it. The projection repeats the feed's
// column list rather than reusing postFeedSelect, because that constant ends at
// `WHERE` and this query needs a third join before it — which also means the two
// lists have to be kept in step by hand, since they share one `scanPostPage`.
//
// The argument order follows the text: the join's `sp.userId = ?` binds first,
// then the fragment's four viewer positions, then LIMIT and OFFSET.
func (db *DB) SavedPosts(userID string, pageNumber int, pageSize int) ([]models.Post, int, error) {
	var totalElements int
	if err := db.Conn.QueryRow(
		"SELECT COUNT(*) FROM post p JOIN savedPost sp ON sp.postId = p.postId AND sp.userId = ? WHERE "+postVisibility,
		userID, userID, userID, userID, userID,
	).Scan(&totalElements); err != nil {
		return nil, 0, err
	}

	offset := (pageNumber - 1) * pageSize
	rows, err := db.Conn.Query(`
		SELECT p.postId, p.publicId, p.userId, p.privacy, u.nickName, u.firstName, u.lastName, p.title, p.content,
			   p.score, p.commentsCounter,
			   p.createdAt, p.updatedAt, p.imageUrls
		FROM post p
		JOIN user u ON p.userId = u.userId
		JOIN savedPost sp ON sp.postId = p.postId AND sp.userId = ?
		WHERE `+postVisibility+`
		ORDER BY sp.createdAt DESC, p.postId DESC
		LIMIT ? OFFSET ?
	`, userID, userID, userID, userID, userID, pageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	posts, err := db.scanPostPage(rows, userID)
	if err != nil {
		return nil, 0, err
	}
	// Every row here is bookmarked by the viewer by definition; the scan deliberately
	// knows nothing about bookmarks, so the flag is set after it rather than inside it.
	for i := range posts {
		posts[i].IsSaved = true
	}
	return posts, totalElements, nil
}
