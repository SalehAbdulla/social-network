package repositories

import (
	realtimeforum "social-network/backend"
	"social-network/backend/pkg/models"
)

type CommentRepository interface {
	GetComments(postId int, pageNumber int, pageSize int, sortBy string, sortOrder string, userID string) ([]models.Comment, int, error)
	CreateComment(userId string, postId int, content string, imageURLs string) (models.Comment, error)
	DeleteComment(commentId int, userId string) error
}

const commentPageSelect = `
		SELECT c.commentId, c.postId, p.publicId, c.userId, u.nickName, c.content, c.imageUrls, c.score, c.createdAt,
		       COALESCE(r.score, 0) AS userScore
		FROM comment c
		JOIN user u ON c.userId = u.userId
		JOIN post p ON p.postId = c.postId
		LEFT JOIN reaction r ON r.entityType = 'comment' AND r.entityId = c.commentId AND r.userId = ?
		WHERE c.postId = ?
		ORDER BY `

func (db *DB) GetComments(postId int, pageNumber int, pageSize int, sortBy string, sortOrder string, userID string) ([]models.Comment, int, error) {

	if err := db.DoesPostExists(postId); err != nil {
		return nil, 0, err
	}

	validSortColumns := map[string]string{
		"createdat": "c.createdAt",
		"score":     "c.score",
	}

	column, ok := validSortColumns[sortBy]
	if !ok {
		column = "c.createdAt"
	}

	validSortOrders := map[string]string{
		"asc":  "ASC",
		"desc": "DESC",
	}

	order, ok := validSortOrders[sortOrder]
	if !ok {
		order = "DESC"
	}

	var totalElements int
	countQuery := "SELECT COUNT(*) FROM comment WHERE postId = ?"
	err := db.Conn.QueryRow(countQuery, postId).Scan(&totalElements)
	if err != nil {
		return nil, 0, realtimeforum.ErrInternal
	}

	offset := (pageNumber - 1) * pageSize

	query := commentPageSelect + column + ` ` + order + `
		LIMIT ? OFFSET ?
	`

	rows, err := db.Conn.Query(query, userID, postId, pageSize, offset)
	if err != nil {
		return nil, 0, realtimeforum.ErrInternal
	}
	defer rows.Close()

	var comments []models.Comment
	for rows.Next() {
		var com models.Comment
		err := rows.Scan(
			&com.CommentId,
			&com.PostId,
			&com.PostPublicID,
			&com.UserId,
			&com.Nickname,
			&com.CommentText,
			&com.ImageURLs,
			&com.Score,
			&com.CreatedAt,
			&com.UserScore,
		)
		if err != nil {
			return nil, 0, realtimeforum.ErrInternal
		}
		comments = append(comments, com)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, realtimeforum.ErrInternal
	}

	if comments == nil {
		comments = []models.Comment{}
	}

	return comments, totalElements, nil
}

func (db *DB) CreateComment(userId string, postId int, content string, imageURLs string) (models.Comment, error) {
	if err := db.DoesPostExists(postId); err != nil {
		return models.Comment{}, err
	}
	if imageURLs == "" {
		imageURLs = "[]"
	}

	result, err := db.Conn.Exec(
		`INSERT INTO comment (postId, userId, content, imageUrls, score, createdAt)
		 VALUES (?, ?, ?, ?, 0, datetime('now'))`,
		postId, userId, content, imageURLs,
	)
	if err != nil {
		return models.Comment{}, realtimeforum.ErrInternal
	}

	commentID, err := result.LastInsertId()
	if err != nil {
		return models.Comment{}, realtimeforum.ErrInternal
	}

	_, err = db.Conn.Exec(
		`UPDATE post SET commentsCounter = commentsCounter + 1 WHERE postId = ?`,
		postId,
	)
	if err != nil {
		return models.Comment{}, realtimeforum.ErrInternal
	}

	var com models.Comment
	err = db.Conn.QueryRow(
		`SELECT c.commentId, c.postId, p.publicId, c.userId, u.nickName, c.content, c.imageUrls, c.score, c.createdAt
		 FROM comment c JOIN post p ON p.postId = c.postId JOIN user u ON u.userId = c.userId
		 WHERE c.commentId = ?`, commentID,
	).Scan(
		&com.CommentId,
		&com.PostId,
		&com.PostPublicID,
		&com.UserId,
		&com.Nickname,
		&com.CommentText,
		&com.ImageURLs,
		&com.Score,
		&com.CreatedAt,
	)

	if err != nil {
		return models.Comment{}, realtimeforum.ErrInternal
	}

	return com, nil
}

func (db *DB) DeleteComment(commentId int, userId string) error {
	var postId int
	err := db.Conn.QueryRow(
		`SELECT postId FROM comment WHERE commentId = ? AND userId = ?`,
		commentId, userId,
	).Scan(&postId)
	if err != nil {
		return realtimeforum.ErrForbidden
	}

	result, err := db.Conn.Exec(
		`DELETE FROM comment WHERE commentId = ? AND userId = ?`,
		commentId, userId,
	)
	if err != nil {
		return realtimeforum.ErrInternal
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return realtimeforum.ErrInternal
	}

	if rowsAffected == 0 {
		return realtimeforum.ErrForbidden
	}

	_, err = db.Conn.Exec(
		`UPDATE post SET commentsCounter = MAX(commentsCounter - 1, 0) WHERE postId = ?`,
		postId,
	)
	if err != nil {
		return realtimeforum.ErrInternal
	}

	return nil
}
