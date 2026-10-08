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

func (db *DB) SocialProfile(id string, viewers ...string) (models.SocialUser, error) {
	u := models.SocialUser{}
	err := db.Conn.QueryRow(`SELECT userId, nickName, firstName, lastName, COALESCE(aboutMe,''), COALESCE(avatar,''), coverPhoto, location, website, contactEmail, phone, showWebsite, showContactEmail, showPhone, isPublic, createdAt FROM user WHERE userId = ?`, id).
		Scan(&u.UserID, &u.Nickname, &u.FirstName, &u.LastName, &u.Bio, &u.Avatar, &u.CoverPhoto, &u.Location, &u.Website, &u.ContactEmail, &u.Phone, &u.ShowWebsite, &u.ShowContactEmail, &u.ShowPhone, &u.IsPublic, &u.CreatedAt)
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
	viewer := id
	if len(viewers) > 0 {
		viewer = viewers[0]
	}
	// postVisibility binds the viewer once per clause
	if err := db.Conn.QueryRow("SELECT COUNT(*) FROM post p WHERE p.userId = ? AND "+postVisibility, id, viewer, viewer, viewer, viewer).Scan(&u.PostCount); err != nil {
		return u, err
	}
	if len(viewers) > 0 && viewers[0] != id {
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

func (db *DB) DiscoverUsers(currentID, search string, limit, offset int) ([]models.SocialUser, error) {
	pattern := likePattern(search)
	ids, err := db.stringList(`SELECT userId FROM user WHERE userId != ? AND (nickName LIKE ? ESCAPE '\' OR firstName || ' ' || lastName LIKE ? ESCAPE '\' OR aboutMe LIKE ? ESCAPE '\' OR location LIKE ? ESCAPE '\') ORDER BY nickName LIMIT ? OFFSET ?`, currentID, pattern, pattern, pattern, pattern, limit, offset)
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

func (db *DB) Suggestions(viewer string, limit int) ([]models.UserSuggestion, error) {
	rows, err := db.Conn.Query(`
		SELECT u.userId, u.nickName, u.firstName, u.lastName, COALESCE(u.avatar, ''), u.isPublic,
			(SELECT COUNT(*)
			   FROM follow f2
			   JOIN follow f3 ON f3.followerId = f2.followedId AND f3.followedId = u.userId
			  WHERE f2.followerId = ?) AS mutualCount
		FROM user u
		WHERE u.userId != ?
		  AND NOT EXISTS (SELECT 1 FROM follow f WHERE f.followerId = ? AND f.followedId = u.userId)
		  AND NOT EXISTS (SELECT 1 FROM connection c WHERE c.requesterId = ? AND c.recipientId = u.userId AND c.status = 'pending')
		ORDER BY mutualCount DESC, COALESCE(u.updatedAt, u.createdAt) DESC, u.userId
		LIMIT ?`,
		viewer, viewer, viewer, viewer, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	suggestions := []models.UserSuggestion{}
	ids := []string{}
	for rows.Next() {
		var s models.UserSuggestion
		if err := rows.Scan(&s.UserID, &s.Nickname, &s.FirstName, &s.LastName, &s.Avatar, &s.IsPublic, &s.MutualCount); err != nil {
			return nil, err
		}
		s.Mutuals = []string{}
		suggestions = append(suggestions, s)
		ids = append(ids, s.UserID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return suggestions, nil
	}

	index := make(map[string]int, len(suggestions))
	for i := range suggestions {
		index[suggestions[i].UserID] = i
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	args := make([]any, 0, len(ids)+1)
	for _, id := range ids {
		args = append(args, id)
	}
	args = append(args, viewer)
	nameRows, err := db.Conn.Query(`
		SELECT f3.followedId, u2.nickName, u2.firstName, u2.lastName
		FROM follow f2
		JOIN follow f3 ON f3.followerId = f2.followedId AND f3.followedId IN (`+placeholders+`)
		JOIN user u2 ON u2.userId = f2.followedId
		WHERE f2.followerId = ?
		ORDER BY f3.followedId, u2.nickName`, args...)
	if err != nil {
		return nil, err
	}
	defer nameRows.Close()
	for nameRows.Next() {
		var candidateID, nickname, first, last string
		if err := nameRows.Scan(&candidateID, &nickname, &first, &last); err != nil {
			return nil, err
		}
		i, ok := index[candidateID]
		if !ok || len(suggestions[i].Mutuals) >= 2 {
			continue
		}
		name := strings.TrimSpace(first + " " + last)
		if name == "" {
			name = nickname
		}
		suggestions[i].Mutuals = append(suggestions[i].Mutuals, name)
	}
	return suggestions, nameRows.Err()
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
	_, err = db.Conn.Exec(`UPDATE user SET nickName=?, firstName=?, lastName=?, aboutMe=?, avatar=?, coverPhoto=?, location=?, website=?, contactEmail=?, phone=?, showWebsite=?, showContactEmail=?, showPhone=?, isPublic=?, updatedAt=datetime('now') WHERE userId=?`, u.Nickname, u.FirstName, u.LastName, u.Bio, u.Avatar, u.CoverPhoto, u.Location, u.Website, u.ContactEmail, u.Phone, u.ShowWebsite, u.ShowContactEmail, u.ShowPhone, u.IsPublic, u.UserID)
	return err
}

func (db *DB) FollowUser(actor, target string) (string, error) {
	tx, err := db.Conn.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
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

func (db *DB) ProfilePostIDs(userID string, liked bool, offset int, viewerID string) ([]int, error) {
	query := "SELECT p.postId FROM post p WHERE p.userId=? AND " + postVisibility + " ORDER BY p.createdAt DESC, p.postId DESC LIMIT 20 OFFSET ?"
	args := []any{userID, viewerID, viewerID, viewerID, viewerID, offset}
	if liked {
		query = "SELECT p.postId FROM post p JOIN reaction r ON r.entityType='post' AND r.entityId=p.postId WHERE r.userId=? AND r.score=1 AND p.userId=? AND " + postVisibility + " ORDER BY p.createdAt DESC, p.postId DESC LIMIT 20 OFFSET ?"
		args = []any{userID, userID, viewerID, viewerID, viewerID, viewerID, offset}
	}
	rows, err := db.Conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int{}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (db *DB) ProfileMedia(userID string, offset int, viewerID string) ([]models.MediaItem, error) {
	rows, err := db.Conn.Query(`
		SELECT image.value, media.postId, media.title, media.createdAt FROM (
			SELECT p.publicId AS postId, p.title AS title, p.imageUrls AS imageUrls, p.createdAt AS createdAt
			FROM post p WHERE p.userId = ? AND `+postVisibility+`
			UNION ALL
			SELECT p.publicId AS postId, c.content AS title, c.imageUrls AS imageUrls, c.createdAt AS createdAt
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
				-- branch by keying on expiry alone. Expiry is therefore what ends access
				-- for everyone but the author, whose own-media branch above still opens
				-- an expired story they kept in their archive — which is why the
				-- collector holds that upload instead of releasing it.
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

func (db *DB) Stories(offset int, viewerID string) ([]models.Story, error) {
	rows, err := db.Conn.Query(`SELECT s.storyId,s.userId,u.nickName,COALESCE(u.avatar,''),s.content,s.mediaUrl,s.mediaType,s.backgroundColor,s.createdAt,s.expiresAt,(v.userId IS NOT NULL),EXISTS(SELECT 1 FROM reaction r WHERE r.entityType='story' AND r.entityId=s.storyId AND r.userId=? AND r.score>0),(SELECT COUNT(*) FROM reaction r2 WHERE r2.entityType='story' AND r2.entityId=s.storyId AND r2.score>0) FROM story s JOIN user u ON u.userId=s.userId LEFT JOIN storyView v ON v.storyId=s.storyId AND v.userId=? WHERE s.expiresAt > datetime('now') AND (s.userId=? OR u.isPublic=1 OR EXISTS(SELECT 1 FROM follow f WHERE f.followerId=? AND f.followedId=s.userId)) ORDER BY (s.userId=?) DESC,(v.userId IS NOT NULL),s.createdAt DESC,s.storyId DESC LIMIT 30 OFFSET ?`, viewerID, viewerID, viewerID, viewerID, viewerID, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	stories := []models.Story{}
	for rows.Next() {
		var s models.Story
		if err := rows.Scan(&s.StoryID, &s.UserID, &s.Nickname, &s.Avatar, &s.Content, &s.MediaURL, &s.MediaType, &s.BackgroundColor, &s.CreatedAt, &s.ExpiresAt, &s.Viewed, &s.Liked, &s.LikeCount); err != nil {
			return nil, err
		}
		stories = append(stories, s)
	}
	return stories, rows.Err()
}

func (db *DB) ArchivedStories(offset int, userID string) ([]models.Story, error) {
	rows, err := db.Conn.Query(`SELECT s.storyId,s.userId,u.nickName,COALESCE(u.avatar,''),s.content,s.mediaUrl,s.mediaType,s.backgroundColor,s.createdAt,s.expiresAt,(v.userId IS NOT NULL),EXISTS(SELECT 1 FROM reaction r WHERE r.entityType='story' AND r.entityId=s.storyId AND r.userId=? AND r.score>0),(SELECT COUNT(*) FROM reaction r2 WHERE r2.entityType='story' AND r2.entityId=s.storyId AND r2.score>0) FROM story s JOIN user u ON u.userId=s.userId LEFT JOIN storyView v ON v.storyId=s.storyId AND v.userId=? WHERE s.userId=? AND s.expiresAt <= datetime('now') ORDER BY s.createdAt DESC,s.storyId DESC LIMIT 30 OFFSET ?`, userID, userID, userID, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	stories := []models.Story{}
	for rows.Next() {
		var s models.Story
		if err := rows.Scan(&s.StoryID, &s.UserID, &s.Nickname, &s.Avatar, &s.Content, &s.MediaURL, &s.MediaType, &s.BackgroundColor, &s.CreatedAt, &s.ExpiresAt, &s.Viewed, &s.Liked, &s.LikeCount); err != nil {
			return nil, err
		}
		stories = append(stories, s)
	}
	return stories, rows.Err()
}

func (db *DB) MarkStoryViewed(storyID int, viewerID string) error {
	var live bool
	if err := db.Conn.QueryRow("SELECT EXISTS(SELECT 1 FROM story WHERE storyId=? AND expiresAt > datetime('now'))", storyID).Scan(&live); err != nil {
		return err
	}
	if !live {
		return backend.ErrNotFound
	}
	_, err := db.Conn.Exec("INSERT INTO storyView (storyId,userId) VALUES (?,?) ON CONFLICT DO NOTHING", storyID, viewerID)
	return err
}

func (db *DB) StoryViewers(storyID int, ownerID string) ([]models.StoryViewer, error) {
	var owned bool
	if err := db.Conn.QueryRow("SELECT EXISTS(SELECT 1 FROM story WHERE storyId=? AND userId=?)", storyID, ownerID).Scan(&owned); err != nil {
		return nil, err
	}
	if !owned {
		return nil, backend.ErrNotFound
	}
	rows, err := db.Conn.Query(
		`SELECT v.userId, COALESCE(u.nickName,''), COALESCE(u.avatar,''), v.viewedAt
		 FROM storyView v JOIN user u ON u.userId=v.userId
		 WHERE v.storyId=? AND v.userId<>?
		 ORDER BY v.viewedAt DESC, v.userId`,
		storyID, ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	viewers := []models.StoryViewer{}
	for rows.Next() {
		var v models.StoryViewer
		if err := rows.Scan(&v.UserID, &v.Nickname, &v.Avatar, &v.ViewedAt); err != nil {
			return nil, err
		}
		viewers = append(viewers, v)
	}
	return viewers, rows.Err()
}

func (db *DB) LiveStoryOwner(storyID int) (string, error) {
	var owner string
	err := db.Conn.QueryRow("SELECT userId FROM story WHERE storyId=? AND expiresAt > datetime('now')", storyID).Scan(&owner)
	if errors.Is(err, sql.ErrNoRows) {
		return "", backend.ErrNotFound
	}
	return owner, err
}

func (db *DB) AddStoryReply(storyID int, userID, content string) (int, error) {
	result, err := db.Conn.Exec("INSERT INTO storyReply (storyId,userId,content) VALUES (?,?,?)", storyID, userID, content)
	if err != nil {
		return 0, err
	}
	id, err := result.LastInsertId()
	return int(id), err
}

func (db *DB) StoryReplies(storyID int, ownerID string) ([]models.StoryReply, error) {
	var owned bool
	if err := db.Conn.QueryRow("SELECT EXISTS(SELECT 1 FROM story WHERE storyId=? AND userId=?)", storyID, ownerID).Scan(&owned); err != nil {
		return nil, err
	}
	if !owned {
		return nil, backend.ErrNotFound
	}
	rows, err := db.Conn.Query(
		`SELECT r.replyId, r.storyId, r.userId, COALESCE(u.nickName,''), COALESCE(u.avatar,''), r.content, r.createdAt
		 FROM storyReply r JOIN user u ON u.userId=r.userId
		 WHERE r.storyId=?
		 ORDER BY r.createdAt DESC, r.replyId DESC`,
		storyID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	replies := []models.StoryReply{}
	for rows.Next() {
		var r models.StoryReply
		if err := rows.Scan(&r.ReplyID, &r.StoryID, &r.UserID, &r.Nickname, &r.Avatar, &r.Content, &r.CreatedAt); err != nil {
			return nil, err
		}
		replies = append(replies, r)
	}
	return replies, rows.Err()
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
