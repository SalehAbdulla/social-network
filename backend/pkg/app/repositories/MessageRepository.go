package repositories

import (
	realtimeforum "social-network/backend"
	"social-network/backend/pkg/models"
)

type MessageRepository interface {
	GetChatUsers(currentUserID string) ([]models.ChatUser, error)
	GetMessages(conversationPartnerID string, currentUserID string, offset int, limit int) ([]models.Message, int, error)
	GetConversationMedia(conversationPartnerID string, currentUserID string, offset int, limit int) ([]models.Message, int, error)
	SaveMessage(senderID string, recipientID string, textMessage string, replyToID int, media ...string) (models.Message, error)
	CanMessage(actor, target string) (bool, error)
}

func (db *DB) GetMessages(conversationPartnerID string, currentUserID string, offset int, limit int) ([]models.Message, int, error) {

	var totalElements int
	err := db.Conn.QueryRow(
		`SELECT COUNT(*) FROM message
		 WHERE NOT EXISTS (SELECT 1 FROM hidden_message h WHERE h.messageId=message.messageId AND h.userId=?) AND ( (senderId = ? AND recipientId = ?) OR (senderId = ? AND recipientId = ?))`,
		currentUserID, currentUserID, conversationPartnerID, conversationPartnerID, currentUserID,
	).Scan(&totalElements)
	if err != nil {
		return nil, 0, realtimeforum.ErrInternal
	}

	query := `
		SELECT message.messageId, message.senderId, message.recipientId, message.content, message.createdAt, message.isRead, message.mediaUrl, message.mediaType, message.editedAt,
			CASE WHEN parent.messageId IS NULL THEN 0 ELSE message.replyToId END, COALESCE(parent.content, ''), COALESCE(parent.senderId, ''),
			(SELECT COALESCE(SUM(r.score), 0) FROM reaction r WHERE r.entityType = 'message' AND r.entityId = message.messageId),
			(SELECT COALESCE(SUM(r.score), 0) FROM reaction r WHERE r.entityType = 'message' AND r.entityId = message.messageId AND r.userId = ?)
		FROM message LEFT JOIN message parent ON parent.messageId = message.replyToId
		WHERE NOT EXISTS (SELECT 1 FROM hidden_message h WHERE h.messageId=message.messageId AND h.userId=?) AND ((message.senderId = ? AND message.recipientId = ?) OR (message.senderId = ? AND message.recipientId = ?))
		ORDER BY message.createdAt DESC, message.messageId DESC
		LIMIT ? OFFSET ?
	`

	rows, err := db.Conn.Query(query, currentUserID, currentUserID, currentUserID, conversationPartnerID, conversationPartnerID, currentUserID, limit, offset)
	if err != nil {
		return nil, 0, realtimeforum.ErrInternal
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		var msg models.Message
		if err := rows.Scan(&msg.MessageId, &msg.SenderId, &msg.RecipientId, &msg.TextMessage, &msg.TimeStamp, &msg.IsRead, &msg.MediaURL, &msg.MediaType, &msg.EditedAt, &msg.ReplyToId, &msg.ReplyToText, &msg.ReplyToSenderId, &msg.Score, &msg.UserScore); err != nil {
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

func (db *DB) GetConversationMedia(conversationPartnerID string, currentUserID string, offset int, limit int) ([]models.Message, int, error) {
	const mediaFilter = `mediaUrl <> '' AND NOT EXISTS (SELECT 1 FROM hidden_message h WHERE h.messageId=message.messageId AND h.userId=?) AND ((senderId = ? AND recipientId = ?) OR (senderId = ? AND recipientId = ?))`

	var totalElements int
	if err := db.Conn.QueryRow(
		"SELECT COUNT(*) FROM message WHERE "+mediaFilter,
		currentUserID, currentUserID, conversationPartnerID, conversationPartnerID, currentUserID,
	).Scan(&totalElements); err != nil {
		return nil, 0, realtimeforum.ErrInternal
	}

	rows, err := db.Conn.Query(
		`SELECT messageId, senderId, recipientId, content, createdAt, isRead, mediaUrl, mediaType, editedAt
		 FROM message WHERE `+mediaFilter+`
		 ORDER BY createdAt DESC, messageId DESC
		 LIMIT ? OFFSET ?`,
		currentUserID, currentUserID, conversationPartnerID, conversationPartnerID, currentUserID, limit, offset,
	)
	if err != nil {
		return nil, 0, realtimeforum.ErrInternal
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		var msg models.Message
		if err := rows.Scan(&msg.MessageId, &msg.SenderId, &msg.RecipientId, &msg.TextMessage, &msg.TimeStamp, &msg.IsRead, &msg.MediaURL, &msg.MediaType, &msg.EditedAt); err != nil {
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

func (db *DB) SaveMessage(senderID string, recipientID string, textMessage string, replyToID int, media ...string) (models.Message, error) {
	mediaURL, mediaType := "", ""
	if len(media) == 2 {
		mediaURL, mediaType = media[0], media[1]
	}
	result, err := db.Conn.Exec(
		`INSERT INTO message (senderId, recipientId, content, isRead, mediaUrl, mediaType, replyToId)
		 VALUES (?, ?, ?, 0, ?, ?, ?)`,
		senderID, recipientID, textMessage, mediaURL, mediaType, replyToID,
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
		`SELECT m.messageId, m.senderId, m.recipientId, m.content, m.createdAt, m.isRead, m.mediaUrl, m.mediaType, m.editedAt,
		        CASE WHEN p.messageId IS NULL THEN 0 ELSE m.replyToId END, COALESCE(p.content, ''), COALESCE(p.senderId, '')
		 FROM message m LEFT JOIN message p ON p.messageId = m.replyToId
		 WHERE m.messageId = ?`,
		messageID,
	).Scan(&msg.MessageId, &msg.SenderId, &msg.RecipientId, &msg.TextMessage, &msg.TimeStamp, &msg.IsRead, &msg.MediaURL, &msg.MediaType, &msg.EditedAt, &msg.ReplyToId, &msg.ReplyToText, &msg.ReplyToSenderId)
	if err != nil {
		return models.Message{}, realtimeforum.ErrInternal
	}

	return msg, nil
}

const chatUsersQuery = `
        SELECT u.userId,u.nickName,u.firstName,u.lastName,COALESCE(u.avatar,''),MAX(m.createdAt) AS lastMessageTime
        FROM user u JOIN message m ON
            (m.senderId=u.userId AND m.recipientId=?) OR (m.senderId=? AND m.recipientId=u.userId)
        WHERE u.userId<>? AND NOT EXISTS (
            SELECT 1 FROM hidden_message h WHERE h.messageId=m.messageId AND h.userId=?
        ) AND (u.isPublic=1 OR EXISTS (
            SELECT 1 FROM follow f WHERE (f.followerId=? AND f.followedId=u.userId) OR (f.followerId=u.userId AND f.followedId=?)
        ))
        GROUP BY u.userId
        ORDER BY lastMessageTime DESC,u.nickName ASC
    `

func (db *DB) GetChatUsers(currentUserID string) ([]models.ChatUser, error) {
	rows, err := db.Conn.Query(chatUsersQuery, currentUserID, currentUserID, currentUserID, currentUserID, currentUserID, currentUserID)
	if err != nil {
		return nil, realtimeforum.ErrInternal
	}
	defer rows.Close()

	var users []models.ChatUser
	for rows.Next() {
		var user models.ChatUser
		if err := rows.Scan(&user.UserId, &user.Nickname, &user.FirstName, &user.LastName, &user.Avatar, &user.LastMessageTime); err != nil {
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
