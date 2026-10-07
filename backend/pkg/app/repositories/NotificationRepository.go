package repositories

import (
	"strings"

	realtimeforum "social-network/backend"
	"social-network/backend/pkg/models"
)

type NotificationRepository interface {
	// types narrows the query to those entity types: the bell badge asks for
	// everything except `message` while the Messages badge asks for `message`
	// only. A nil list means every known type; an empty list matches nothing.
	GetNotifications(userID string, offset, limit int, unreadOnly bool, types []string) ([]models.Notification, int, error)
	GetUnreadCount(userID string, types []string) (int, error)
	// GetUnreadCounts answers both badges at once: the bell (every type but
	// `message`) and the Messages badge (`message` only). It is the same predicate
	// as GetUnreadCount, split into two subtotals by one pass.
	GetUnreadCounts(userID string) (int, int, error)
	CreateNotification(userID, actorID, entityType string, entityID int) (models.Notification, error)
	MarkAsRead(notificationID int, userID string) error
	MarkAllAsRead(userID string) error
	MarkAsReadByActor(userID, actorID, entityType string) error
}

// notificationTypeFilter builds `<column> IN (?,?,…)` together with its
// arguments. A nil list expands to every type the API exposes and an empty list
// becomes a false predicate, because `IN ()` is not valid SQL.
func notificationTypeFilter(column string, types []string) (string, []any) {
	if types == nil {
		types = models.NotificationEntityTypes()
	}
	if len(types) == 0 {
		return "1 = 0", nil
	}
	args := make([]any, len(types))
	for i, entityType := range types {
		args[i] = entityType
	}
	return column + " IN (" + strings.TrimSuffix(strings.Repeat("?,", len(types)), ",") + ")", args
}

// notificationPageSelect is the notifications list's projection and joins, shared with
// the plan test (query_plan_test.go) so the plan it prints is this query's. The type
// filter and the userId predicate are appended at the call site, both of them dynamic.
const notificationPageSelect = `
		SELECT n.notificationId, n.userId, n.actorId, COALESCE(u.nickName, ''), n.entityType, n.entityId, n.isRead, n.createdAt, COALESCE(p.publicId, '')
		FROM notification n
		LEFT JOIN user u ON n.actorId = u.userId
		LEFT JOIN comment c ON n.entityType = 'comment' AND n.entityId = c.commentId
		LEFT JOIN post p ON p.postId = c.postId
		WHERE `

func (db *DB) GetNotifications(userID string, offset, limit int, unreadOnly bool, types []string) ([]models.Notification, int, error) {
	countFilter, countFilterArgs := notificationTypeFilter("entityType", types)
	countQuery := "SELECT COUNT(*) FROM notification WHERE " + countFilter + " AND userId = ?"
	countArgs := append(append([]any{}, countFilterArgs...), userID)
	if unreadOnly {
		countQuery += " AND isRead = 0"
	}

	var totalElements int
	if err := db.Conn.QueryRow(countQuery, countArgs...).Scan(&totalElements); err != nil {
		return nil, 0, realtimeforum.ErrInternal
	}

	selectFilter, selectFilterArgs := notificationTypeFilter("n.entityType", types)
	query := notificationPageSelect + selectFilter + ` AND n.userId = ?
	`
	if unreadOnly {
		query += " AND n.isRead = 0"
	}
	query += " ORDER BY n.createdAt DESC LIMIT ? OFFSET ?"

	args := append(append([]any{}, selectFilterArgs...), userID, limit, offset)
	rows, err := db.Conn.Query(query, args...)
	if err != nil {
		return nil, 0, realtimeforum.ErrInternal
	}
	defer rows.Close()

	var notifications []models.Notification
	for rows.Next() {
		var n models.Notification
		if err := rows.Scan(&n.NotificationId, &n.UserId, &n.ActorId, &n.ActorNickname, &n.EntityType, &n.EntityId, &n.IsRead, &n.CreatedAt, &n.PostId); err != nil {
			return nil, 0, realtimeforum.ErrInternal
		}
		notifications = append(notifications, n)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, realtimeforum.ErrInternal
	}

	if notifications == nil {
		notifications = []models.Notification{}
	}

	return notifications, totalElements, nil
}

// GetUnreadCount counts the unread rows a filtered badge should show. `types`
// follows the same nil/empty rules as GetNotifications.
func (db *DB) GetUnreadCount(userID string, types []string) (int, error) {
	filter, filterArgs := notificationTypeFilter("entityType", types)
	args := append(append([]any{}, filterArgs...), userID)

	var count int
	err := db.Conn.QueryRow(
		"SELECT COUNT(*) FROM notification WHERE "+filter+" AND userId = ? AND isRead = 0",
		args...,
	).Scan(&count)
	if err != nil {
		return 0, realtimeforum.ErrInternal
	}
	return count, nil
}

// GetUnreadCounts answers both badges in one query. The bell counts every unread
// row except private messages; the Messages entry counts only those. Both subtotals
// come from the same predicate GetUnreadCount applies, which is the point: the
// sidebar asked the server twice for one answer, on every socket event and every
// poll. COALESCE is required because SUM over no rows is NULL, not zero.
func (db *DB) GetUnreadCounts(userID string) (int, int, error) {
	var notifications, messages int
	err := db.Conn.QueryRow(
		`SELECT COALESCE(SUM(CASE WHEN entityType <> 'message' THEN 1 ELSE 0 END), 0),
		        COALESCE(SUM(CASE WHEN entityType = 'message' THEN 1 ELSE 0 END), 0)
		 FROM notification
		 WHERE userId = ? AND isRead = 0`,
		userID,
	).Scan(&notifications, &messages)
	if err != nil {
		return 0, 0, realtimeforum.ErrInternal
	}
	return notifications, messages, nil
}

func (db *DB) CreateNotification(userID, actorID, entityType string, entityID int) (models.Notification, error) {
	result, err := db.Conn.Exec(
		`INSERT INTO notification (userId, actorId, entityType, entityId, message, isRead, createdAt)
		 VALUES (?, ?, ?, ?, '', 0, datetime('now'))`,
		userID, actorID, entityType, entityID,
	)
	if err != nil {
		return models.Notification{}, realtimeforum.ErrInternal
	}

	notificationID, err := result.LastInsertId()
	if err != nil {
		return models.Notification{}, realtimeforum.ErrInternal
	}

	var n models.Notification
	err = db.Conn.QueryRow(
		`SELECT n.notificationId, n.userId, n.actorId, COALESCE(u.nickName, ''), n.entityType, n.entityId, n.isRead, n.createdAt, COALESCE(p.publicId, '')
		 FROM notification n
		 LEFT JOIN user u ON n.actorId = u.userId
		 LEFT JOIN comment c ON n.entityType = 'comment' AND n.entityId = c.commentId
		 LEFT JOIN post p ON p.postId = c.postId
		 WHERE n.notificationId = ?`,
		notificationID,
	).Scan(&n.NotificationId, &n.UserId, &n.ActorId, &n.ActorNickname, &n.EntityType, &n.EntityId, &n.IsRead, &n.CreatedAt, &n.PostId)
	if err != nil {
		return models.Notification{}, realtimeforum.ErrInternal
	}

	return n, nil
}

func (db *DB) MarkAsRead(notificationID int, userID string) error {
	result, err := db.Conn.Exec(
		"UPDATE notification SET isRead = 1 WHERE notificationId = ? AND userId = ?",
		notificationID, userID,
	)
	if err != nil {
		return realtimeforum.ErrInternal
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return realtimeforum.ErrInternal
	}

	if rowsAffected == 0 {
		return realtimeforum.ErrNotFound
	}

	return nil
}

func (db *DB) MarkAllAsRead(userID string) error {
	result, err := db.Conn.Exec(
		"UPDATE notification SET isRead = 1 WHERE userId = ? AND isRead = 0",
		userID,
	)
	if err != nil {
		return realtimeforum.ErrInternal
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return realtimeforum.ErrInternal
	}

	if rowsAffected == 0 {

		return nil
	}

	_ = rowsAffected
	return nil
}

func (db *DB) MarkAsReadByActor(userID, actorID, entityType string) error {
	_, err := db.Conn.Exec(
		"UPDATE notification SET isRead = 1 WHERE userId = ? AND actorId = ? AND entityType = ? AND isRead = 0",
		userID, actorID, entityType,
	)
	if err != nil {
		return realtimeforum.ErrInternal
	}

	return nil
}
