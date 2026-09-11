package repositories

import (
	realtimeforum "social-network/backend"
	"social-network/backend/pkg/models"
)

type PostRepository interface {
	GetPosts(pageNumber int, pageSize int, sortBy string, sortOrder string, viewerID string) ([]models.Post, int, error)
	CreatePost(post models.Post) (models.Post, error)
	DoesPostExists(postId int) error
	GetPostByID(postId int, viewerID string) (models.Post, error)
	CanViewPost(postID int, viewerID string) (bool, error)
	ValidateSelectedFollowers(ownerID string, selectedIDs []string) error
	DeletePost(postId int, userId string) error
}

const postVisibility = `(p.privacy = 'public' OR p.userId = ? OR (p.privacy = 'followers' AND EXISTS (SELECT 1 FROM follow f WHERE f.followerId = ? AND f.followedId = p.userId)) OR (p.privacy = 'selected' AND EXISTS (SELECT 1 FROM post_selected_follower psf WHERE psf.postId = p.postId AND psf.userId = ?)))`

func (db *DB) GetPosts(pageNumber int, pageSize int, sortBy string, sortOrder string, viewerID string) ([]models.Post, int, error) {
	validSortColumns := map[string]string{
		"createdat": "p.createdAt",
		"title":     "p.title",
		"score":     "p.score",
	}

	column, ok := validSortColumns[sortBy]
	if !ok {
		column = "p.createdAt"
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
	err := db.Conn.QueryRow("SELECT COUNT(*) FROM post p WHERE "+postVisibility, viewerID, viewerID, viewerID).Scan(&totalElements)
	if err != nil {
		return nil, 0, err
	}

	offset := (pageNumber - 1) * pageSize

	query := `
		SELECT p.postId, p.userId, p.privacy, u.nickName, p.title, p.content,
			   p.score, p.commentsCounter,
			   p.createdAt, p.updatedAt, p.imageUrls
		FROM post p
		JOIN user u ON p.userId = u.userId
		WHERE ` + postVisibility + `
		ORDER BY ` + column + ` ` + order + `
		LIMIT ? OFFSET ?
	`

	rows, err := db.Conn.Query(query, viewerID, viewerID, viewerID, pageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var posts []models.Post
	for rows.Next() {
		var post models.Post
		err := rows.Scan(
			&post.PostId,
			&post.UserId,
			&post.Privacy,
			&post.Nickname,
			&post.Title,
			&post.Content,
			&post.Score,
			&post.CommentsCounter,
			&post.CreatedAt,
			&post.UpdatedAt,
			&post.ImageURLs,
		)
		if err != nil {
			return nil, 0, err
		}
		if post.UserId == viewerID {
			post.SelectedUsers, err = db.selectedUsers(post.PostId)
			if err != nil {
				return nil, 0, err
			}
		}
		posts = append(posts, post)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, err
	}

	if posts == nil {
		posts = []models.Post{}
	}

	return posts, totalElements, nil
}

func (db *DB) DoesPostExists(postId int) error {
	var count int
	err := db.Conn.QueryRow("SELECT COUNT(*) FROM post WHERE postId = ?", postId).Scan(&count)
	if err != nil {
		return err
	}
	if count == 0 {
		return realtimeforum.ErrNotFound
	}
	return nil
}

func (db *DB) GetPostByID(postId int, viewerID string) (models.Post, error) {
	var post models.Post
	err := db.Conn.QueryRow(
		`SELECT p.postId, p.userId, p.privacy, u.nickName, p.title, p.content,
				p.score, p.commentsCounter,
				p.createdAt, p.updatedAt, p.imageUrls
		FROM post p
		JOIN user u ON p.userId = u.userId
			WHERE p.postId = ? AND `+postVisibility, postId, viewerID, viewerID, viewerID,
	).Scan(
		&post.PostId,
		&post.UserId,
		&post.Privacy,
		&post.Nickname,
		&post.Title,
		&post.Content,
		&post.Score,
		&post.CommentsCounter,
		&post.CreatedAt,
		&post.UpdatedAt,
		&post.ImageURLs,
	)
	if err != nil {
		return models.Post{}, realtimeforum.ErrNotFound
	}
	if post.UserId == viewerID {
		post.SelectedUsers, err = db.selectedUsers(post.PostId)
		if err != nil {
			return models.Post{}, err
		}
	}
	return post, nil
}

func (db *DB) CanViewPost(postID int, viewerID string) (bool, error) {
	var allowed bool
	err := db.Conn.QueryRow("SELECT EXISTS(SELECT 1 FROM post p WHERE p.postId = ? AND "+postVisibility+")", postID, viewerID, viewerID, viewerID).Scan(&allowed)
	return allowed, err
}

func (db *DB) ValidateSelectedFollowers(ownerID string, selectedIDs []string) error {
	for _, selectedID := range selectedIDs {
		var exists bool
		if err := db.Conn.QueryRow("SELECT EXISTS(SELECT 1 FROM follow WHERE followerId = ? AND followedId = ?)", selectedID, ownerID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return realtimeforum.ErrBadRequest
		}
	}
	return nil
}

func (db *DB) selectedUsers(postID int) ([]string, error) {
	return db.stringList("SELECT userId FROM post_selected_follower WHERE postId = ? ORDER BY userId", postID)
}

func (db *DB) DeletePost(postId int, userId string) error {
	result, err := db.Conn.Exec("DELETE FROM post WHERE postId = ? AND userId = ?", postId, userId)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return realtimeforum.ErrNotFound
	}
	return nil
}

func (db *DB) CreatePost(post models.Post) (models.Post, error) {
	now := "datetime('now')"
	result, err := db.Conn.Exec(
		`INSERT INTO post (userId, title, content, privacy, score, commentsCounter, createdAt, updatedAt, imageUrls)
		 VALUES (?, ?, ?, ?, 0, 0, `+now+`, `+now+`, ?)`,
		post.UserId, post.Title, post.Content, post.Privacy, post.ImageURLs,
	)
	if err != nil {
		return models.Post{}, err
	}

	postID, err := result.LastInsertId()
	if err != nil {
		return models.Post{}, err
	}

	err = db.Conn.QueryRow(
		`SELECT p.postId, p.userId, p.privacy, u.nickName, p.title, p.content,
				p.score, p.commentsCounter,
				p.createdAt, p.updatedAt, p.imageUrls
		FROM post p
		JOIN user u ON p.userId = u.userId
		WHERE p.postId = ?`, postID,
	).Scan(
		&post.PostId,
		&post.UserId,
		&post.Privacy,
		&post.Nickname,
		&post.Title,
		&post.Content,
		&post.Score,
		&post.CommentsCounter,
		&post.CreatedAt,
		&post.UpdatedAt,
		&post.ImageURLs,
	)
	if err != nil {
		return models.Post{}, err
	}
	for _, selectedID := range post.SelectedUsers {
		if _, err := db.Conn.Exec("INSERT INTO post_selected_follower(postId,userId) VALUES (?,?)", postID, selectedID); err != nil {
			return models.Post{}, err
		}
	}
	post.SelectedUsers, err = db.selectedUsers(post.PostId)
	if err != nil {
		return models.Post{}, err
	}

	return post, nil
}
