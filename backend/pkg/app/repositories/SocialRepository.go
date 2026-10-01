package repositories

import (
	"database/sql"
	"errors"

	backend "social-network/backend"
	"social-network/backend/pkg/models"
)

func (db *DB) stringList(query string, args ...any) ([]string, error) {
	rows, err := db.Conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []string{}
	for rows.Next() {
		var value string
		if err := rows.Scan(&value); err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, rows.Err()
}

func (db *DB) SocialProfile(id string, viewers ...string) (models.SocialUser, error) {
	u := models.SocialUser{}
	err := db.Conn.QueryRow(`SELECT userId, nickName, firstName, lastName, COALESCE(aboutMe,''), COALESCE(avatar,''), coverPhoto, location, isPublic, createdAt FROM user WHERE userId = ?`, id).
		Scan(&u.UserID, &u.Nickname, &u.FirstName, &u.LastName, &u.Bio, &u.Avatar, &u.CoverPhoto, &u.Location, &u.IsPublic, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return u, backend.ErrNotFound
	}
	if err != nil {
		return u, err
	}
	queries := []struct {
		target *[]string
		query  string
		args   []any
	}{
		{&u.Followers, "SELECT followerId FROM follow WHERE followedId = ?", []any{id}},
		{&u.Following, "SELECT followedId FROM follow WHERE followerId = ?", []any{id}},
	}
	for _, q := range queries {
		*q.target, err = db.stringList(q.query, q.args...)
		if err != nil {
			return u, err
		}
	}
	if len(viewers) > 0 && viewers[0] != id {
		// The third flag is the chat rule seen from viewers[0]: the profile is
		// public, or either user follows the other.
		err = db.Conn.QueryRow(`SELECT
			EXISTS(SELECT 1 FROM connection WHERE requesterId=? AND recipientId=? AND status='pending'),
			EXISTS(SELECT 1 FROM connection WHERE requesterId=? AND recipientId=? AND status='pending'),
			EXISTS(SELECT 1 FROM user u WHERE u.userId=? AND (u.isPublic=1 OR EXISTS(
				SELECT 1 FROM follow f WHERE (f.followerId=? AND f.followedId=?) OR (f.followerId=? AND f.followedId=?))))`,
			id, viewers[0], viewers[0], id,
			id, viewers[0], id, id, viewers[0]).Scan(&u.PendingIncoming, &u.PendingOutgoing, &u.CanMessage)
	}
	return u, err
}

// UserIDByNickname resolves a handle to the account it belongs to, which is what a
// mention needs: the linkifier only has the text of an `@handle`, and the profile route
// is keyed by id. The comparison ignores case on both sides — a nickname is stored as it
// was typed, and a mention in the middle of a sentence must not require the reader to
// reproduce the capitalisation.
func (db *DB) UserIDByNickname(nickname string) (string, error) {
	var id string
	err := db.Conn.QueryRow("SELECT userId FROM user WHERE lower(nickName) = lower(?)", nickname).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", backend.ErrNotFound
	}
	if err != nil {
		return "", err
	}
	return id, nil
}

// CanMessage reports whether actor may start or continue a private chat with
// target: the spec allows it when at least one of them follows the other, and a
// public profile is reachable by anyone. A missing target reports ErrNotFound so
// callers can answer 404 instead of 403.
func (db *DB) CanMessage(actor, target string) (bool, error) {
	if target == "" || actor == target {
		return false, nil
	}
	var allowed bool
	err := db.Conn.QueryRow(`SELECT isPublic = 1 OR EXISTS(
			SELECT 1 FROM follow f WHERE (f.followerId=? AND f.followedId=?) OR (f.followerId=? AND f.followedId=?))
		FROM user WHERE userId = ?`, actor, target, target, actor, target).Scan(&allowed)
	if errors.Is(err, sql.ErrNoRows) {
		return false, backend.ErrNotFound
	}
	if err != nil {
		return false, err
	}
	return allowed, nil
}

func (db *DB) CanViewPrivateProfile(viewerID, profileID string) (bool, error) {
	if viewerID == profileID {
		return true, nil
	}
	var allowed bool
	err := db.Conn.QueryRow(`SELECT isPublic = 1 OR EXISTS(SELECT 1 FROM follow WHERE followerId = ? AND followedId = ?) FROM user WHERE userId = ?`, viewerID, profileID, profileID).Scan(&allowed)
	if errors.Is(err, sql.ErrNoRows) {
		return false, backend.ErrNotFound
	}
	return allowed, err
}

func (db *DB) DiscoverUsers(currentID, search string, offset int) ([]models.SocialUser, error) {
	pattern := likePattern(search)
	ids, err := db.stringList(`SELECT userId FROM user WHERE userId != ? AND (nickName LIKE ? ESCAPE '\' OR firstName || ' ' || lastName LIKE ? ESCAPE '\' OR aboutMe LIKE ? ESCAPE '\' OR location LIKE ? ESCAPE '\') ORDER BY nickName LIMIT 30 OFFSET ?`, currentID, pattern, pattern, pattern, pattern, offset)
	if err != nil {
		return nil, err
	}
	users := []models.SocialUser{}
	for _, id := range ids {
		u, err := db.SocialProfile(id, currentID)
		if err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

func (db *DB) UpdateSocialProfile(u models.SocialUser) error {
	var other string
	err := db.Conn.QueryRow("SELECT userId FROM user WHERE nickName = ? AND userId != ?", u.Nickname, u.UserID).Scan(&other)
	if err == nil {
		return backend.ErrNickName
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	_, err = db.Conn.Exec(`UPDATE user SET nickName=?, firstName=?, lastName=?, aboutMe=?, avatar=?, coverPhoto=?, location=?, isPublic=?, updatedAt=datetime('now') WHERE userId=?`, u.Nickname, u.FirstName, u.LastName, u.Bio, u.Avatar, u.CoverPhoto, u.Location, u.IsPublic, u.UserID)
	return err
}

func (db *DB) FollowUser(actor, target string) (string, error) {
	tx, err := db.Conn.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	// Acquire the write lock before checking state, including for opposite requests.
	if _, err = tx.Exec("UPDATE user SET isPublic=isPublic WHERE userId=?", target); err != nil {
		return "", err
	}
	var public, following, pending, reverse bool
	err = tx.QueryRow(`SELECT isPublic,
		EXISTS(SELECT 1 FROM follow WHERE followerId=? AND followedId=?),
		EXISTS(SELECT 1 FROM connection WHERE requesterId=? AND recipientId=? AND status='pending'),
		EXISTS(SELECT 1 FROM connection WHERE requesterId=? AND recipientId=? AND status='pending')
		FROM user WHERE userId=?`, actor, target, actor, target, target, actor, target).
		Scan(&public, &following, &pending, &reverse)
	if errors.Is(err, sql.ErrNoRows) {
		return "", backend.ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if following {
		return "", backend.ErrAlreadyFollowing
	}
	if pending {
		return "", backend.ErrFollowPending
	}
	if reverse {
		return "", backend.ErrReverseFollowPending
	}
	status := "following"
	if public {
		_, err = tx.Exec("INSERT INTO follow(followerId,followedId) VALUES (?,?)", actor, target)
	} else {
		status = "pending"
		_, err = tx.Exec("INSERT INTO connection(requesterId,recipientId,status) VALUES (?,?,'pending')", actor, target)
	}
	if err != nil {
		return "", err
	}
	return status, tx.Commit()
}

func (db *DB) UnfollowUser(actor, target string) error {
	tx, err := db.Conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec("DELETE FROM follow WHERE followerId=? AND followedId=?", actor, target); err != nil {
		return err
	}
	if _, err = tx.Exec("DELETE FROM connection WHERE requesterId=? AND recipientId=? AND status='pending'", actor, target); err != nil {
		return err
	}
	if _, err = tx.Exec("DELETE FROM notification WHERE userId=? AND actorId=? AND entityType='follow_request'", target, actor); err != nil {
		return err
	}
	return tx.Commit()
}

// followRequestsQuery lists the pending requests waiting for a decision, newest
// first. It is a constant so the plan test (query_plan_test.go) can explain the same
// text instead of a paraphrase, which is what makes the index it asserts on the index
// this query uses.
const followRequestsQuery = `SELECT c.requesterId,u.nickName,c.createdAt FROM connection c
		JOIN user u ON u.userId=c.requesterId WHERE c.recipientId=? AND c.status='pending'
		ORDER BY c.createdAt DESC,c.requesterId LIMIT 30 OFFSET ?`

func (db *DB) FollowRequests(recipient string, offset int) ([]models.FollowRequest, error) {
	rows, err := db.Conn.Query(followRequestsQuery, recipient, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []models.FollowRequest{}
	for rows.Next() {
		var item models.FollowRequest
		if err := rows.Scan(&item.UserID, &item.Nickname, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (db *DB) DecideFollowRequest(recipient, requester string, accept bool) error {
	tx, err := db.Conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = affected(tx.Exec("DELETE FROM connection WHERE requesterId=? AND recipientId=? AND status='pending'", requester, recipient)); err != nil {
		return err
	}
	if accept {
		if _, err = tx.Exec("INSERT INTO follow(followerId,followedId) VALUES (?,?)", requester, recipient); err != nil {
			return err
		}
	}
	if _, err = tx.Exec("DELETE FROM notification WHERE userId=? AND actorId=? AND entityType='follow_request'", recipient, requester); err != nil {
		return err
	}
	return tx.Commit()
}

func (db *DB) ProfilePostIDs(userID string, liked bool, offset int, viewerID string) ([]string, error) {
	if liked {
		return db.stringList("SELECT CAST(p.postId AS TEXT) FROM post p JOIN reaction r ON r.entityType='post' AND r.entityId=p.postId WHERE r.userId=? AND r.score=1 AND p.userId=? AND "+postVisibility+" ORDER BY p.createdAt DESC, p.postId DESC LIMIT 20 OFFSET ?", userID, userID, viewerID, viewerID, viewerID, viewerID, offset)
	}
	return db.stringList("SELECT CAST(p.postId AS TEXT) FROM post p WHERE p.userId=? AND "+postVisibility+" ORDER BY p.createdAt DESC, p.postId DESC LIMIT 20 OFFSET ?", userID, viewerID, viewerID, viewerID, viewerID, offset)
}

// ProfileMedia merges the photos a user published in posts with the ones they
// attached to comments, newest first, applying the same postPrivacy rules the
// feed uses. It backs the profile media tab.
func (db *DB) ProfileMedia(userID string, offset int, viewerID string) ([]models.MediaItem, error) {
	rows, err := db.Conn.Query(`
		SELECT image.value, media.postId, media.title, media.createdAt FROM (
			SELECT p.postId AS postId, p.title AS title, p.imageUrls AS imageUrls, p.createdAt AS createdAt
			FROM post p WHERE p.userId = ? AND `+postVisibility+`
			UNION ALL
			SELECT c.postId AS postId, c.content AS title, c.imageUrls AS imageUrls, c.createdAt AS createdAt
			FROM comment c JOIN post p ON p.postId = c.postId WHERE c.userId = ? AND `+postVisibility+`
		) media, json_each(media.imageUrls) image
		WHERE image.value <> ''
		ORDER BY media.createdAt DESC, media.postId DESC
		LIMIT 20 OFFSET ?`,
		userID, viewerID, viewerID, viewerID, viewerID,
		userID, viewerID, viewerID, viewerID, viewerID,
		offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.MediaItem{}
	for rows.Next() {
		var item models.MediaItem
		if err := rows.Scan(&item.Url, &item.PostId, &item.Title, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (db *DB) AddMedia(id, userID, contentType string) error {
	_, err := db.Conn.Exec("INSERT INTO media (mediaId,userId,contentType) VALUES (?,?,?)", id, userID, contentType)
	return err
}

func (db *DB) MediaInfo(id string) (string, string, error) {
	var owner, contentType string
	err := db.Conn.QueryRow("SELECT userId, contentType FROM media WHERE mediaId=?", id).Scan(&owner, &contentType)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", backend.ErrNotFound
	}
	return owner, contentType, err
}

func (db *DB) CanViewMedia(id, viewerID string) (bool, error) {
	var allowed bool
	err := db.Conn.QueryRow(`SELECT EXISTS(
		SELECT 1 FROM media m WHERE m.mediaId = ? AND (
			m.userId = ? OR EXISTS(
				SELECT 1 FROM post p, json_each(p.imageUrls) image
				WHERE image.value = '/api/v1/media/' || m.mediaId AND `+postVisibility+`
			) OR EXISTS (
				SELECT 1 FROM groupContent gc JOIN socialGroupMember gm ON gm.groupId=gc.groupId
				WHERE gc.mediaUrl='/api/v1/media/' || m.mediaId AND gm.userId=?
			) OR EXISTS (
				-- Stories carry no audience: a live one is readable by any signed-in
				-- member. That is a decision, not an omission — the spec's story
				-- requirement names no privacy, and the listing query agrees with this
				-- branch by keying on expiry alone. Expiry is therefore the only thing
				-- that ends access, which is also why an expired story releases its
				-- upload to the collector.
				SELECT 1 FROM story s WHERE s.mediaUrl='/api/v1/media/' || m.mediaId AND s.expiresAt>datetime('now')
			) OR EXISTS (
				SELECT 1 FROM socialGroup g WHERE g.imageUrl='/api/v1/media/' || m.mediaId
			) OR EXISTS (
				SELECT 1 FROM user u WHERE u.avatar='/api/v1/media/' || m.mediaId
			) OR EXISTS (
				SELECT 1 FROM user u WHERE u.coverPhoto='/api/v1/media/' || m.mediaId AND
				(u.isPublic=1 OR EXISTS(SELECT 1 FROM follow f WHERE f.followedId=u.userId AND f.followerId=?))
			) OR EXISTS (
				SELECT 1 FROM message msg WHERE msg.mediaUrl='/api/v1/media/' || m.mediaId AND (msg.senderId=? OR msg.recipientId=?)
			) OR EXISTS (
				-- A comment photo is readable exactly when the post it hangs off is.
				SELECT 1 FROM comment c JOIN post p ON p.postId = c.postId, json_each(c.imageUrls) image
				WHERE image.value = '/api/v1/media/' || m.mediaId AND `+postVisibility+`
			)
		)
	)`, id, viewerID, viewerID, viewerID, viewerID, viewerID, viewerID, viewerID, viewerID, viewerID, viewerID, viewerID, viewerID, viewerID).Scan(&allowed)
	return allowed, err
}

func (db *DB) CreateStory(s models.Story) (int, error) {
	result, err := db.Conn.Exec("INSERT INTO story (userId,content,mediaUrl,mediaType,backgroundColor) VALUES (?,?,?,?,?)", s.UserID, s.Content, s.MediaURL, s.MediaType, s.BackgroundColor)
	if err != nil {
		return 0, err
	}
	id, err := result.LastInsertId()
	return int(id), err
}

func (db *DB) Stories(offset int) ([]models.Story, error) {
	rows, err := db.Conn.Query(`SELECT s.storyId,s.userId,u.nickName,COALESCE(u.avatar,''),s.content,s.mediaUrl,s.mediaType,s.backgroundColor,s.createdAt,s.expiresAt FROM story s JOIN user u ON u.userId=s.userId WHERE s.expiresAt > datetime('now') ORDER BY s.createdAt DESC,s.storyId DESC LIMIT 30 OFFSET ?`, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	stories := []models.Story{}
	for rows.Next() {
		var s models.Story
		if err := rows.Scan(&s.StoryID, &s.UserID, &s.Nickname, &s.Avatar, &s.Content, &s.MediaURL, &s.MediaType, &s.BackgroundColor, &s.CreatedAt, &s.ExpiresAt); err != nil {
			return nil, err
		}
		stories = append(stories, s)
	}
	return stories, rows.Err()
}

func affected(result sql.Result, err error) error {
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err == nil && n == 0 {
		return backend.ErrNotFound
	}
	return err
}

func (db *DB) DeleteStory(id int, userID string) error {
	return affected(db.Conn.Exec("DELETE FROM story WHERE storyId=? AND userId=?", id, userID))
}

func (db *DB) EditComment(id int, userID, content string) error {
	return affected(db.Conn.Exec("UPDATE comment SET content=?, updatedAt=datetime('now') WHERE commentId=? AND userId=?", content, id, userID))
}

func (db *DB) EditMessage(id int, userID, text string) error {
	return affected(db.Conn.Exec("UPDATE message SET content=?, editedAt=datetime('now') WHERE messageId=? AND senderId=?", text, id, userID))
}

func (db *DB) DeleteMessage(id int, userID string, everyone bool) error {
	if everyone {
		return affected(db.Conn.Exec("DELETE FROM message WHERE messageId=? AND senderId=?", id, userID))
	}
	var count int
	if err := db.Conn.QueryRow("SELECT COUNT(*) FROM message WHERE messageId=? AND (senderId=? OR recipientId=?)", id, userID, userID).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		return backend.ErrNotFound
	}
	_, err := db.Conn.Exec("INSERT INTO hidden_message (messageId,userId) VALUES (?,?) ON CONFLICT DO NOTHING", id, userID)
	return err
}

func (db *DB) MarkMessagesRead(userID, partner string) (bool, error) {
	result, err := db.Conn.Exec("UPDATE message SET isRead=1 WHERE recipientId=? AND senderId=? AND isRead=0", userID, partner)
	if err != nil {
		return false, err
	}
	changed, err := result.RowsAffected()
	return changed > 0, err
}

func (db *DB) MessageParticipants(id int) (string, string, error) {
	var sender, recipient string
	err := db.Conn.QueryRow("SELECT senderId,recipientId FROM message WHERE messageId=?", id).Scan(&sender, &recipient)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", backend.ErrNotFound
	}
	return sender, recipient, err
}
