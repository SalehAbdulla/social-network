package repositories

import (
	"strings"

	"social-network/backend/pkg/models"
)

func (db *DB) SavePost(userID string, postID int) error {
	_, err := db.Conn.Exec(
		"INSERT INTO savedPost (userId, postId) VALUES (?, ?) ON CONFLICT(userId, postId) DO NOTHING",
		userID, postID,
	)
	return err
}

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
	for i := range posts {
		posts[i].IsSaved = true
	}
	return posts, totalElements, nil
}
