package repositories

import (
	"database/sql"

	realtimeforum "social-network/backend"
	"social-network/backend/pkg/models"
)

type PostRepository interface {
	GetPosts(pageNumber int, pageSize int, sortBy string, sortOrder string, viewerID string) ([]models.Post, int, error)
	CreatePost(post models.Post) (models.Post, error)
	UpdatePost(post models.Post) (models.Post, error)
	DoesPostExists(postId int) error
	GetPostByID(postId int, viewerID string) (models.Post, error)
	CanViewPost(postID int, viewerID string) (bool, error)
	// PostInsights is the author-facing numbers for one post, in one round trip. It is
	// not viewer-relative, so it says nothing about who is asking; the caller decides
	// who may ask (PostService.PostInsights allows only the post's author).
	PostInsights(postID int) (models.PostInsights, error)
	ValidateSelectedFollowers(ownerID string, selectedIDs []string) error
	DeletePost(postId int, userId string) error
	// Bookmarks live on this interface because a saved post is still a post: the
	// same visibility fragment decides what the list may show, and PostService
	// already holds this repository. They are implemented in SavedPostRepository.go.
	SavePost(userID string, postID int) error
	UnsavePost(userID string, postID int) error
	IsPostSaved(userID string, postID int) (bool, error)
	SavedPostIDs(userID string, postIDs []int) (map[int]bool, error)
	SavedPosts(userID string, pageNumber int, pageSize int) ([]models.Post, int, error)
	// SearchPosts finds posts whose title or content contains a term, newest
	// first, filtered by the same visibility fragment as the feed — so searching
	// cannot become a way to read a post the viewer is not allowed to open.
	SearchPosts(search string, pageNumber int, pageSize int, viewerID string) ([]models.Post, int, error)
	// HashtagPosts is one tag's results page. It runs the same visibility fragment
	// again: a hashtag is a way to find posts, never a way to read ones the viewer
	// could not have opened.
	HashtagPosts(tag string, pageNumber int, pageSize int, viewerID string) ([]models.Post, int, error)
}

// postVisibility decides who may read a post. The three levels differ on purpose:
//
//   - `public` needs the owner's profile to be public, or a follow. A private
//     profile hides even its public posts from strangers (see DEPLOYMENT.md).
//   - `followers` ("almost private" in the spec) is a LIVE relation: the row in
//     `follow` has to exist when the post is read.
//   - `selected` ("private": only the followers chosen by the creator) is an
//     explicit grant. `post_selected_follower` records who the author picked at
//     write time, so unfollowing later does not silently revoke a post the author
//     shared with them; the author's lever is editing the post, which rewrites the
//     list from their current followers (PostRepository.ValidateSelectedFollowers).
//
// The same fragment backs the feed, a single post, profile posts and likes,
// profile media, comment access and direct media access, so those six surfaces
// cannot drift apart.
const postVisibility = `(p.userId = ? OR (p.privacy = 'public' AND (EXISTS (SELECT 1 FROM user u WHERE u.userId = p.userId AND u.isPublic = 1) OR EXISTS (SELECT 1 FROM follow f WHERE f.followerId = ? AND f.followedId = p.userId))) OR (p.privacy = 'followers' AND EXISTS (SELECT 1 FROM follow f WHERE f.followerId = ? AND f.followedId = p.userId)) OR (p.privacy = 'selected' AND EXISTS (SELECT 1 FROM post_selected_follower psf WHERE psf.postId = p.postId AND psf.userId = ?)))`

// postFeedSelect is the feed's projection and joins. It is a constant so the plan
// test (query_plan_test.go) explains the same text the feed runs — a plan asserted
// against a paraphrase would keep passing while the real query changed shape. The
// ORDER BY and LIMIT stay at the call site because both come from the request.
const postFeedSelect = `
		SELECT p.postId, p.userId, p.privacy, u.nickName, u.firstName, u.lastName, p.title, p.content,
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

// scanPostPage reads every row of a `postFeedSelect` page and fills the audience list
// for the viewer's own posts. It is one function because three read paths — the feed,
// the search and the hashtag page — return exactly this projection, and a column added
// to `postFeedSelect` should not have to be added to three scan lists to keep working.
//
// The rows are closed before the per-post lookup, on purpose: the pool can hold a
// single connection (the tests set MaxOpenConns(1)), and a query issued while this
// *Rows is still open would wait for the connection it is holding. The callers' `defer
// rows.Close()` still covers the early returns inside the loop.
func (db *DB) scanPostPage(rows *sql.Rows, viewerID string) ([]models.Post, error) {
	posts := []models.Post{}
	for rows.Next() {
		var post models.Post
		if err := rows.Scan(
			&post.PostId,
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

// postSearchFilter is the predicate a search adds to the visibility rule. The two
// `?` are the same escaped pattern, once for the title and once for the body; the
// ESCAPE clause is what makes likePattern's escapes mean anything.
const postSearchFilter = ` AND (p.title LIKE ? ESCAPE '\' OR p.content LIKE ? ESCAPE '\')`

// SearchPosts answers a text query with the posts whose title or content matches
// it, newest first. It runs the feed's own projection and visibility fragment, so
// the page it returns is a page of posts the viewer could have opened anyway; the
// search adds a predicate rather than a second way in.
//
// No index can serve this: the pattern starts with `%`, so SQLite has to look at
// every post and evaluate the fragment per row, exactly as the feed did before
// 000013 — which is why the plan test names this query with an empty index rather
// than claiming one. Measured rather than assumed; it is in that table.
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

// hashtagFilter matches a `#tag` in a post's title or body with hashtag boundaries:
// the tag may not be glued to a word on either side, so `#travel` matches neither
// `#traveling` nor `abc#travel`. SQLite's GLOB is what makes that expressible — LIKE
// has no character classes — which is why the haystack is lowercased first (GLOB is
// case-sensitive) and padded with a space at each end, so a tag can sit at the very
// start or the very end of the text. That leading pad is load-bearing: without it a
// title that *begins* with `#tag` has no character before the `#` to match, and the
// post is silently missing from its own tag page. The handler has already restricted
// the tag to `[a-z0-9_]`, and that is what keeps it out of GLOB's own syntax.
const hashtagFilter = ` AND lower(' ' || p.title || ' ' || p.content || ' ') GLOB ?`

// hashtagGlob is the pattern one tag is looked for with: anything, a character that is
// not part of a word, the tag, a character that is not part of a word, anything.
func hashtagGlob(tag string) string {
	return "*[^a-z0-9_]#" + tag + "[^a-z0-9_]*"
}

// HashtagPosts is the hashtag results page: the posts carrying one tag, newest first,
// behind the feed's own visibility rule. It scans, like the text search does and for
// the same reason — a pattern beginning with `*` can use no index, which is why the
// plan table lists both with no index rather than claiming one. Nothing is stored, so
// a post written before this existed is findable by its tag immediately.
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
		`SELECT p.postId, p.userId, p.privacy, u.nickName, u.firstName, u.lastName, p.title, p.content,
				p.score, p.commentsCounter,
				p.createdAt, p.updatedAt, p.imageUrls
		FROM post p
		JOIN user u ON p.userId = u.userId
			WHERE p.postId = ? AND `+postVisibility, postId, viewerID, viewerID, viewerID, viewerID,
	).Scan(
		&post.PostId,
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

// CanViewComment reports whether the viewer may read a comment, which means they
// may read the post it belongs to. Reactions and any future comment surface use
// it so a comment cannot be reached through a post the viewer cannot open.
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
		`SELECT p.postId, p.userId, p.privacy, u.nickName, u.firstName, u.lastName, p.title, p.content,
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
