package repositories

import (
	"database/sql"
	"errors"

	"github.com/google/uuid"

	realtimeforum "social-network/backend"
	"social-network/backend/pkg/models"
)

type PostRepository interface {
	GetPosts(pageNumber int, pageSize int, sortBy string, sortOrder string, viewerID string) ([]models.Post, int, error)
	CreatePost(post models.Post) (models.Post, error)
	UpdatePost(post models.Post) (models.Post, error)
	DoesPostExists(postId int) error
	PostIDByPublicID(publicID string) (int, error)
	GetPostByID(postId int, viewerID string) (models.Post, error)
	CanViewPost(postID int, viewerID string) (bool, error)
	PostInsights(postID int) (models.PostInsights, error)
	ValidateSelectedFollowers(ownerID string, selectedIDs []string) error
	DeletePost(postId int, userId string) error
	SavePost(userID string, postID int) error
	UnsavePost(userID string, postID int) error
	IsPostSaved(userID string, postID int) (bool, error)
	SavedPostIDs(userID string, postIDs []int) (map[int]bool, error)
	SavedPosts(userID string, pageNumber int, pageSize int) ([]models.Post, int, error)
	SearchPosts(search string, pageNumber int, pageSize int, viewerID string) ([]models.Post, int, error)
	HashtagPosts(tag string, pageNumber int, pageSize int, viewerID string) ([]models.Post, int, error)
}

const postVisibility = `(p.userId = ? OR (p.privacy = 'public' AND (EXISTS (SELECT 1 FROM user u WHERE u.userId = p.userId AND u.isPublic = 1) OR EXISTS (SELECT 1 FROM follow f WHERE f.followerId = ? AND f.followedId = p.userId))) OR (p.privacy = 'followers' AND EXISTS (SELECT 1 FROM follow f WHERE f.followerId = ? AND f.followedId = p.userId)) OR (p.privacy = 'selected' AND EXISTS (SELECT 1 FROM post_selected_follower psf WHERE psf.postId = p.postId AND psf.userId = ?)))`

const postFeedSelect = `
		SELECT p.postId, p.publicId, p.userId, p.privacy, u.nickName, u.firstName, u.lastName, p.title, p.content,
			   p.score, p.commentsCounter,
			   p.createdAt, p.updatedAt, p.imageUrls
		FROM post p
		JOIN user u ON p.userId = u.userId
		WHERE `

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
	err := db.Conn.QueryRow("SELECT COUNT(*) FROM post p WHERE "+postVisibility, viewerID, viewerID, viewerID, viewerID).Scan(&totalElements)
	if err != nil {
		return nil, 0, err
	}

	offset := (pageNumber - 1) * pageSize

	query := postFeedSelect + postVisibility + `
		ORDER BY ` + column + ` ` + order + `
		LIMIT ? OFFSET ?
	`

	rows, err := db.Conn.Query(query, viewerID, viewerID, viewerID, viewerID, pageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	posts, err := db.scanPostPage(rows, viewerID)
	if err != nil {
		return nil, 0, err
	}
	return posts, totalElements, nil
}

func (db *DB) scanPostPage(rows *sql.Rows, viewerID string) ([]models.Post, error) {
	posts := []models.Post{}
	for rows.Next() {
		var post models.Post
		if err := rows.Scan(
			&post.PostId,
			&post.PublicID,
			&post.UserId,
			&post.Privacy,
			&post.Nickname,
			&post.FirstName,
			&post.LastName,
			&post.Title,
			&post.Content,
			&post.Score,
			&post.CommentsCounter,
			&post.CreatedAt,
			&post.UpdatedAt,
			&post.ImageURLs,
		); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	for i := range posts {
		if posts[i].UserId == viewerID {
			var err error
			posts[i].SelectedUsers, err = db.selectedUsers(posts[i].PostId)
			if err != nil {
				return nil, err
			}
		}
	}
	return posts, nil
}

const postSearchFilter = ` AND (p.title LIKE ? ESCAPE '\' OR p.content LIKE ? ESCAPE '\')`

func (db *DB) SearchPosts(search string, pageNumber int, pageSize int, viewerID string) ([]models.Post, int, error) {
	pattern := likePattern(search)

	var totalElements int
	if err := db.Conn.QueryRow(
		"SELECT COUNT(*) FROM post p WHERE "+postVisibility+postSearchFilter,
		viewerID, viewerID, viewerID, viewerID, pattern, pattern,
	).Scan(&totalElements); err != nil {
		return nil, 0, err
	}

	offset := (pageNumber - 1) * pageSize
	query := postFeedSelect + postVisibility + postSearchFilter + `
		ORDER BY p.createdAt DESC, p.postId DESC
		LIMIT ? OFFSET ?
	`
	rows, err := db.Conn.Query(query, viewerID, viewerID, viewerID, viewerID, pattern, pattern, pageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	posts, err := db.scanPostPage(rows, viewerID)
	if err != nil {
		return nil, 0, err
	}
	return posts, totalElements, nil
}

const hashtagFilter = ` AND lower(' ' || p.title || ' ' || p.content || ' ') GLOB ?`

func hashtagGlob(tag string) string {
	return "*[^a-z0-9_]#" + tag + "[^a-z0-9_]*"
}

func (db *DB) HashtagPosts(tag string, pageNumber int, pageSize int, viewerID string) ([]models.Post, int, error) {
	pattern := hashtagGlob(tag)

	var totalElements int
	if err := db.Conn.QueryRow(
		"SELECT COUNT(*) FROM post p WHERE "+postVisibility+hashtagFilter,
		viewerID, viewerID, viewerID, viewerID, pattern,
	).Scan(&totalElements); err != nil {
		return nil, 0, err
	}

	offset := (pageNumber - 1) * pageSize
	query := postFeedSelect + postVisibility + hashtagFilter + `
		ORDER BY p.createdAt DESC, p.postId DESC
		LIMIT ? OFFSET ?
	`
	rows, err := db.Conn.Query(query, viewerID, viewerID, viewerID, viewerID, pattern, pageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	posts, err := db.scanPostPage(rows, viewerID)
	if err != nil {
		return nil, 0, err
	}
	return posts, totalElements, nil
}

func (db *DB) PostIDByPublicID(publicID string) (int, error) {
	var postID int
	err := db.Conn.QueryRow("SELECT postId FROM post WHERE publicId = ?", publicID).Scan(&postID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, realtimeforum.ErrNotFound
	}
	if err != nil {
		return 0, realtimeforum.ErrInternal
	}
	return postID, nil
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
		`SELECT p.postId, p.publicId, p.userId, p.privacy, u.nickName, u.firstName, u.lastName, p.title, p.content,
				p.score, p.commentsCounter,
				p.createdAt, p.updatedAt, p.imageUrls
		FROM post p
		JOIN user u ON p.userId = u.userId
			WHERE p.postId = ? AND `+postVisibility, postId, viewerID, viewerID, viewerID, viewerID,
	).Scan(
		&post.PostId,
		&post.PublicID,
		&post.UserId,
		&post.Privacy,
		&post.Nickname,
		&post.FirstName,
		&post.LastName,
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
	err := db.Conn.QueryRow("SELECT EXISTS(SELECT 1 FROM post p WHERE p.postId = ? AND "+postVisibility+")", postID, viewerID, viewerID, viewerID, viewerID).Scan(&allowed)
	return allowed, err
}

func (db *DB) CanViewComment(commentID int, viewerID string) (bool, error) {
	var allowed bool
	err := db.Conn.QueryRow(`SELECT EXISTS(
		SELECT 1 FROM comment c JOIN post p ON p.postId = c.postId
		WHERE c.commentId = ? AND `+postVisibility+`)`, commentID, viewerID, viewerID, viewerID, viewerID).Scan(&allowed)
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

func (db *DB) UpdatePost(post models.Post) (models.Post, error) {
	tx, err := db.Conn.Begin()
	if err != nil {
		return models.Post{}, err
	}
	defer tx.Rollback()
	result, err := tx.Exec(`UPDATE post SET title=?,content=?,privacy=?,imageUrls=?,updatedAt=datetime('now') WHERE postId=? AND userId=?`,
		post.Title, post.Content, post.Privacy, post.ImageURLs, post.PostId, post.UserId)
	if err != nil {
		return models.Post{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return models.Post{}, err
	}
	if count == 0 {
		return models.Post{}, realtimeforum.ErrNotFound
	}
	if _, err = tx.Exec("DELETE FROM post_selected_follower WHERE postId=?", post.PostId); err != nil {
		return models.Post{}, err
	}
	for _, userID := range post.SelectedUsers {
		if _, err = tx.Exec("INSERT INTO post_selected_follower(postId,userId) VALUES (?,?) ON CONFLICT DO NOTHING", post.PostId, userID); err != nil {
			return models.Post{}, err
		}
	}
	if err = tx.Commit(); err != nil {
		return models.Post{}, err
	}
	return db.GetPostByID(post.PostId, post.UserId)
}

func (db *DB) CreatePost(post models.Post) (models.Post, error) {
	now := "datetime('now')"
	post.PublicID = uuid.NewString()
	result, err := db.Conn.Exec(
		`INSERT INTO post (publicId, userId, title, content, privacy, score, commentsCounter, createdAt, updatedAt, imageUrls)
		 VALUES (?, ?, ?, ?, ?, 0, 0, `+now+`, `+now+`, ?)`,
		post.PublicID, post.UserId, post.Title, post.Content, post.Privacy, post.ImageURLs,
	)
	if err != nil {
		return models.Post{}, err
	}

	postID, err := result.LastInsertId()
	if err != nil {
		return models.Post{}, err
	}

	err = db.Conn.QueryRow(
		`SELECT p.postId, p.publicId, p.userId, p.privacy, u.nickName, u.firstName, u.lastName, p.title, p.content,
				p.score, p.commentsCounter,
				p.createdAt, p.updatedAt, p.imageUrls
		FROM post p
		JOIN user u ON p.userId = u.userId
		WHERE p.postId = ?`, postID,
	).Scan(
		&post.PostId,
		&post.PublicID,
		&post.UserId,
		&post.Privacy,
		&post.Nickname,
		&post.FirstName,
		&post.LastName,
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
