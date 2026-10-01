package repositories

import (
	realtimeforum "social-network/backend"
	"social-network/backend/pkg/models"
)

type MessageRepository interface {
	GetChatUsers(currentUserID string) ([]models.ChatUser, error)
	GetMessages(conversationPartnerID string, currentUserID string, offset int, limit int) ([]models.Message, int, error)
	// GetConversationMedia is the same thread as GetMessages, filtered to the rows that
	// carry an attachment: it backs the chat's media tab.
	GetConversationMedia(conversationPartnerID string, currentUserID string, offset int, limit int) ([]models.Message, int, error)
	SaveMessage(senderID string, recipientID string, textMessage string, media ...string) (models.Message, error)
	// CanMessage is implemented alongside the social queries; the message
	// service uses it to enforce the chat rule in one place.
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

	// The two subqueries answer for one message each: its reaction total, and the
	// reader's own reaction. They ride the (entityType, entityId) index 000013 added, so
	// a page of messages costs one indexed lookup per row rather than a second query.
	// The reader's `?` sits in the SELECT list, which is why it is the first argument
	// below rather than the last: bind order follows the text, not the meaning.
	query := `
		SELECT messageId, senderId, recipientId, content, createdAt, isRead, mediaUrl, mediaType, editedAt,
			(SELECT COALESCE(SUM(r.score), 0) FROM reaction r WHERE r.entityType = 'message' AND r.entityId = message.messageId),
			(SELECT COALESCE(SUM(r.score), 0) FROM reaction r WHERE r.entityType = 'message' AND r.entityId = message.messageId AND r.userId = ?)
		FROM message
		WHERE NOT EXISTS (SELECT 1 FROM hidden_message h WHERE h.messageId=message.messageId AND h.userId=?) AND ((senderId = ? AND recipientId = ?) OR (senderId = ? AND recipientId = ?))
		ORDER BY createdAt DESC, messageId DESC
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
		if err := rows.Scan(&msg.MessageId, &msg.SenderId, &msg.RecipientId, &msg.TextMessage, &msg.TimeStamp, &msg.IsRead, &msg.MediaURL, &msg.MediaType, &msg.EditedAt, &msg.Score, &msg.UserScore); err != nil {
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

// GetConversationMedia lists the attachments in one direct conversation, newest first. It is
// the same thread `GetMessages` reads — the same two participants, the same rule about rows
// hidden for this viewer — narrowed to the messages that carry an attachment. Nothing here
// computes a reaction total: a tile in the media tab has no control to draw.
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

func (db *DB) SaveMessage(senderID string, recipientID string, textMessage string, media ...string) (models.Message, error) {
	mediaURL, mediaType := "", ""
	if len(media) == 2 {
		mediaURL, mediaType = media[0], media[1]
	}
	result, err := db.Conn.Exec(
		`INSERT INTO message (senderId, recipientId, content, isRead, mediaUrl, mediaType)
		 VALUES (?, ?, ?, 0, ?, ?)`,
		senderID, recipientID, textMessage, mediaURL, mediaType,
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
		`SELECT messageId, senderId, recipientId, content, createdAt, isRead, mediaUrl, mediaType, editedAt
		 FROM message WHERE messageId = ?`,
		messageID,
	).Scan(&msg.MessageId, &msg.SenderId, &msg.RecipientId, &msg.TextMessage, &msg.TimeStamp, &msg.IsRead, &msg.MediaURL, &msg.MediaType, &msg.EditedAt)
	if err != nil {
		return models.Message{}, realtimeforum.ErrInternal
	}

	return msg, nil
}

// chatUsersQuery lists the conversations the viewer can still use. Threads whose
// participants no longer satisfy the chat rule are hidden, not deleted: the rows stay
// in `message` and reappear as soon as either user follows the other again. It is a
// constant so the plan test (query_plan_test.go) explains this text rather than a
// paraphrase of it.
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
