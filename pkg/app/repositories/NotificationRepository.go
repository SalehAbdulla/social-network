package repositories

import (
	realtimeforum "real-time-forum"
	"real-time-forum/pkg/models"
)

type NotificationRepository interface {
	GetNotifications(userID string, offset, limit int, unreadOnly bool) ([]models.Notification, int, error)
	GetUnreadCount(userID string) (int, error)
	CreateNotification(userID, actorID, entityType string, entityID int) (models.Notification, error)
	MarkAsRead(notificationID int, userID string) error
	MarkAllAsRead(userID string) error
	MarkAsReadByActor(userID, actorID, entityType string) error
}

func (db *DB) GetNotifications(userID string, offset, limit int, unreadOnly bool) ([]models.Notification, int, error) {
	var totalElements int
	var countQuery string
	var countArgs []interface{}

	if unreadOnly {
		countQuery = "SELECT COUNT(*) FROM notification WHERE userId = ? AND isRead = 0"
		countArgs = []interface{}{userID}
	} else {
		countQuery = "SELECT COUNT(*) FROM notification WHERE userId = ?"
		countArgs = []interface{}{userID}
	}

	err := db.Conn.QueryRow(countQuery, countArgs...).Scan(&totalElements)
	if err != nil {
		return nil, 0, realtimeforum.ErrInternal
	}

	query := `
		SELECT n.notificationId, n.userId, n.actorId, COALESCE(u.nickName, ''), n.entityType, n.entityId, n.isRead, n.createdAt
		FROM notification n
		LEFT JOIN user u ON n.actorId = u.userId
		WHERE n.userId = ?
	`
	var args []interface{}
	args = append(args, userID)

	if unreadOnly {
		query += " AND n.isRead = 0"
	}

	query += " ORDER BY n.createdAt DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := db.Conn.Query(query, args...)
	if err != nil {
		return nil, 0, realtimeforum.ErrInternal
	}
	defer rows.Close()

	var notifications []models.Notification
	for rows.Next() {
		var n models.Notification
		if err := rows.Scan(&n.NotificationId, &n.UserId, &n.ActorId, &n.ActorNickname, &n.EntityType, &n.EntityId, &n.IsRead, &n.CreatedAt); err != nil {
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

func (db *DB) GetUnreadCount(userID string) (int, error) {
	var count int
	err := db.Conn.QueryRow(
		"SELECT COUNT(*) FROM notification WHERE userId = ? AND isRead = 0",
		userID,
	).Scan(&count)
	if err != nil {
		return 0, realtimeforum.ErrInternal
	}
	return count, nil
}

func (db *DB) CreateNotification(userID, actorID, entityType string, entityID int) (models.Notification, error) {
	result, err := db.Conn.Exec(
		`INSERT INTO notification (userId, actorId, entityType, entityId, isRead, createdAt)
		 VALUES (?, ?, ?, ?, 0, datetime('now'))`,
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
		`SELECT n.notificationId, n.userId, n.actorId, COALESCE(u.nickName, ''), n.entityType, n.entityId, n.isRead, n.createdAt
		 FROM notification n
		 LEFT JOIN user u ON n.actorId = u.userId
		 WHERE n.notificationId = ?`,
		notificationID,
	).Scan(&n.NotificationId, &n.UserId, &n.ActorId, &n.ActorNickname, &n.EntityType, &n.EntityId, &n.IsRead, &n.CreatedAt)
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
