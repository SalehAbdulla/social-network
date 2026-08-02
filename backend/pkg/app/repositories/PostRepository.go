package repositories

import (
	realtimeforum "real-time-forum"
	"real-time-forum/pkg/models"
)

type PostRepository interface {
	GetPosts(pageNumber int, pageSize int, sortBy string, sortOrder string, categoryId int) ([]models.Post, int, error)
	CreatePost(post models.Post) (models.Post, error)
	DoesPostExists(postId int) error
	GetPostByID(postId int) (models.Post, error)
	DeletePost(postId int, userId string) error
}

func (db *DB) GetPosts(pageNumber int, pageSize int, sortBy string, sortOrder string, categoryId int) ([]models.Post, int, error) {
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
	countQuery := "SELECT COUNT(*) FROM post p"
	var countArgs []interface{}
	var whereClause string
	if categoryId > 0 {
		whereClause = " WHERE p.categoryId = ?"
		countQuery += whereClause
		countArgs = append(countArgs, categoryId)
	}
	err := db.Conn.QueryRow(countQuery, countArgs...).Scan(&totalElements)
	if err != nil {
		return nil, 0, err
	}

	offset := (pageNumber - 1) * pageSize

	query := `
		SELECT p.postId, p.userId, u.nickName, p.title, p.content, 
			   p.categoryId, c.categoryName, p.score, p.commentsCounter, 
			   p.createdAt, p.updatedAt
		FROM post p
		JOIN user u ON p.userId = u.userId
		JOIN category c ON p.categoryId = c.categoryId` + whereClause + `
		ORDER BY ` + column + ` ` + order + `
		LIMIT ? OFFSET ?
	`
	var queryArgs []interface{}
	if categoryId > 0 {
		queryArgs = append(queryArgs, categoryId)
	}
	queryArgs = append(queryArgs, pageSize, offset)

	rows, err := db.Conn.Query(query, queryArgs...)
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
			&post.Nickname,
			&post.Title,
			&post.Content,
			&post.CategoryId,
			&post.CategoryName,
			&post.Score,
			&post.CommentsCounter,
			&post.CreatedAt,
			&post.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
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

func (db *DB) GetPostByID(postId int) (models.Post, error) {
	var post models.Post
	err := db.Conn.QueryRow(
		`SELECT p.postId, p.userId, u.nickName, p.title, p.content,
				p.categoryId, c.categoryName, p.score, p.commentsCounter,
				p.createdAt, p.updatedAt
		FROM post p
		JOIN user u ON p.userId = u.userId
		JOIN category c ON p.categoryId = c.categoryId
		WHERE p.postId = ?`, postId,
	).Scan(
		&post.PostId,
		&post.UserId,
		&post.Nickname,
		&post.Title,
		&post.Content,
		&post.CategoryId,
		&post.CategoryName,
		&post.Score,
		&post.CommentsCounter,
		&post.CreatedAt,
		&post.UpdatedAt,
	)
	if err != nil {
		return models.Post{}, realtimeforum.ErrNotFound
	}
	return post, nil
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
		`INSERT INTO post (userId, title, content, categoryId, score, commentsCounter, createdAt, updatedAt)
		 VALUES (?, ?, ?, ?, 0, 0, `+now+`, `+now+`)`,
		post.UserId, post.Title, post.Content, post.CategoryId,
	)
	if err != nil {
		return models.Post{}, err
	}

	postID, err := result.LastInsertId()
	if err != nil {
		return models.Post{}, err
	}

	err = db.Conn.QueryRow(
		`SELECT p.postId, p.userId, u.nickName, p.title, p.content,
				p.categoryId, c.categoryName, p.score, p.commentsCounter,
				p.createdAt, p.updatedAt
		FROM post p
		JOIN user u ON p.userId = u.userId
		JOIN category c ON p.categoryId = c.categoryId
		WHERE p.postId = ?`, postID,
	).Scan(
		&post.PostId,
		&post.UserId,
		&post.Nickname,
		&post.Title,
		&post.Content,
		&post.CategoryId,
		&post.CategoryName,
		&post.Score,
		&post.CommentsCounter,
		&post.CreatedAt,
		&post.UpdatedAt,
	)
	if err != nil {
		return models.Post{}, err
	}

	return post, nil
}
