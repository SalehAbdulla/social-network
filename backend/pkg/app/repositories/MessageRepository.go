package repositories

import (
	realtimeforum "real-time-forum"
	"real-time-forum/pkg/models"
)

type MessageRepository interface {
	GetChatUsers(currentUserID string) ([]models.ChatUser, error)
	GetMessages(conversationPartnerID string, currentUserID string, offset int, limit int) ([]models.Message, int, error)
	SaveMessage(senderID string, recipientID string, textMessage string) (models.Message, error)
}

func (db *DB) GetMessages(conversationPartnerID string, currentUserID string, offset int, limit int) ([]models.Message, int, error) {

	var totalElements int
	err := db.Conn.QueryRow(
		`SELECT COUNT(*) FROM message
		 WHERE (senderId = ? AND recipientId = ?) OR (senderId = ? AND recipientId = ?)`,
		currentUserID, conversationPartnerID, conversationPartnerID, currentUserID,
	).Scan(&totalElements)
	if err != nil {
		return nil, 0, realtimeforum.ErrInternal
	}

	query := `
		SELECT messageId, senderId, recipientId, textMessage, timeStamp, isRead
		FROM message
		WHERE (senderId = ? AND recipientId = ?) OR (senderId = ? AND recipientId = ?)
		ORDER BY timeStamp DESC
		LIMIT ? OFFSET ?
	`

	rows, err := db.Conn.Query(query, currentUserID, conversationPartnerID, conversationPartnerID, currentUserID, limit, offset)
	if err != nil {
		return nil, 0, realtimeforum.ErrInternal
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		var msg models.Message
		if err := rows.Scan(&msg.MessageId, &msg.SenderId, &msg.RecipientId, &msg.TextMessage, &msg.TimeStamp, &msg.IsRead); err != nil {
			return nil, 0, realtimeforum.ErrInternal
		}
		messages = append(messages, msg)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, realtimeforum.ErrInternal
	}

	if messages == nil {
		messages = []models.Message{}
	}

	return messages, totalElements, nil
}

func (db *DB) SaveMessage(senderID string, recipientID string, textMessage string) (models.Message, error) {
	result, err := db.Conn.Exec(
		`INSERT INTO message (senderId, recipientId, textMessage, isRead)
		 VALUES (?, ?, ?, 0)`,
		senderID, recipientID, textMessage,
	)
	if err != nil {
		return models.Message{}, realtimeforum.ErrInternal
	}

	messageID, err := result.LastInsertId()
	if err != nil {
		return models.Message{}, realtimeforum.ErrInternal
	}

	var msg models.Message
	err = db.Conn.QueryRow(
		`SELECT messageId, senderId, recipientId, textMessage, timeStamp, isRead
		 FROM message WHERE messageId = ?`,
		messageID,
	).Scan(&msg.MessageId, &msg.SenderId, &msg.RecipientId, &msg.TextMessage, &msg.TimeStamp, &msg.IsRead)
	if err != nil {
		return models.Message{}, realtimeforum.ErrInternal
	}

	return msg, nil
}

func (db *DB) GetChatUsers(currentUserID string) ([]models.ChatUser, error) {
	query := `
		SELECT
			u.userId,
			u.nickName,
			(
				SELECT MAX(m.timeStamp)
				FROM message m
				WHERE (m.senderId = u.userId AND m.recipientId = ?) OR (m.senderId = ? AND m.recipientId = u.userId)
			) AS lastMessageTime
		FROM user u
		WHERE u.userId != ?
		ORDER BY
			CASE WHEN lastMessageTime IS NULL THEN 1 ELSE 0 END,
			lastMessageTime DESC,
			u.nickName ASC
	`

	rows, err := db.Conn.Query(query, currentUserID, currentUserID, currentUserID)
	if err != nil {
		return nil, realtimeforum.ErrInternal
	}
	defer rows.Close()

	var users []models.ChatUser
	for rows.Next() {
		var user models.ChatUser
		if err := rows.Scan(&user.UserId, &user.Nickname, &user.LastMessageTime); err != nil {
			return nil, realtimeforum.ErrInternal
		}
		users = append(users, user)
	}

	if err := rows.Err(); err != nil {
		return nil, realtimeforum.ErrInternal
	}

	if users == nil {
		users = []models.ChatUser{}
	}

	return users, nil
}