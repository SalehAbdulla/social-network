package repositories

import (
	"database/sql"
	"errors"
	"strings"

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

func (db *DB) SocialProfile(id string) (models.SocialUser, error) {
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
		{&u.Connections, "SELECT CASE WHEN requesterId = ? THEN recipientId ELSE requesterId END FROM connection WHERE (requesterId = ? OR recipientId = ?) AND status = 'accepted'", []any{id, id, id}},
		{&u.Pending, "SELECT requesterId FROM connection WHERE recipientId = ? AND status = 'pending'", []any{id}},
		{&u.Requested, "SELECT recipientId FROM connection WHERE requesterId = ? AND status = 'pending'", []any{id}},
	}
	for _, q := range queries {
		*q.target, err = db.stringList(q.query, q.args...)
		if err != nil {
			return u, err
		}
	}
	return u, nil
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
	pattern := "%" + strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(search, "\\", "\\\\"), "%", "\\%"), "_", "\\_") + "%"
	ids, err := db.stringList(`SELECT userId FROM user WHERE userId != ? AND (nickName LIKE ? ESCAPE '\' OR firstName || ' ' || lastName LIKE ? ESCAPE '\' OR aboutMe LIKE ? ESCAPE '\' OR location LIKE ? ESCAPE '\') ORDER BY nickName LIMIT 30 OFFSET ?`, currentID, pattern, pattern, pattern, pattern, offset)
	if err != nil {
		return nil, err
	}
	users := []models.SocialUser{}
	for _, id := range ids {
		u, err := db.SocialProfile(id)
		if err != nil {
			return nil, err
		}
		// Pending requests are visible only to the account owner.
		u.Pending, u.Requested = []string{}, []string{}
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

func (db *DB) FollowUser(actor, target string, follow bool) (bool, error) {
	query := "INSERT INTO follow (followerId, followedId) VALUES (?, ?) ON CONFLICT DO NOTHING"
	if !follow {
		query = "DELETE FROM follow WHERE followerId = ? AND followedId = ?"
	}
	result, err := db.Conn.Exec(query, actor, target)
	if err != nil {
		return false, err
	}
	n, err := result.RowsAffected()
	return n > 0, err
}

func (db *DB) ChangeConnection(actor, target, action string) (bool, error) {
	var result sql.Result
	var err error
	switch action {
	case "request":
		result, err = db.Conn.Exec("INSERT INTO connection (requesterId, recipientId) VALUES (?, ?) ON CONFLICT DO NOTHING", actor, target)
	case "accept":
		result, err = db.Conn.Exec("UPDATE connection SET status = 'accepted' WHERE requesterId = ? AND recipientId = ? AND status = 'pending'", target, actor)
	case "remove":
		result, err = db.Conn.Exec("DELETE FROM connection WHERE (requesterId = ? AND recipientId = ?) OR (requesterId = ? AND recipientId = ?)", actor, target, target, actor)
	default:
		return false, backend.ErrBadRequest
	}
	if err != nil {
		return false, err
	}
	n, err := result.RowsAffected()
	if err == nil && n == 0 && action == "accept" {
		return false, backend.ErrNotFound
	}
	return n > 0, err
}

func (db *DB) ProfilePostIDs(userID string, liked bool, offset int, viewerID string) ([]string, error) {
	if liked {
		return db.stringList("SELECT CAST(p.postId AS TEXT) FROM post p JOIN reaction r ON r.entityType='post' AND r.entityId=p.postId WHERE r.userId=? AND r.score=1 AND p.userId=? AND "+postVisibility+" ORDER BY p.createdAt DESC, p.postId DESC LIMIT 20 OFFSET ?", userID, userID, viewerID, viewerID, viewerID, viewerID, offset)
	}
	return db.stringList("SELECT CAST(p.postId AS TEXT) FROM post p WHERE p.userId=? AND "+postVisibility+" ORDER BY p.createdAt DESC, p.postId DESC LIMIT 20 OFFSET ?", userID, viewerID, viewerID, viewerID, viewerID, offset)
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
			)
		)
	)`, id, viewerID, viewerID, viewerID, viewerID, viewerID).Scan(&allowed)
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
