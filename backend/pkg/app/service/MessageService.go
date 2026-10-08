package service

import (
	realtimeforum "social-network/backend"
	db "social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/payload/message"
	"strings"
	"unicode/utf8"
)

type MessageService interface {
	GetChatUsers(currentUserID string) ([]message.ChatUserDTO, error)
	GetMessages(conversationPartnerID string, currentUserID string, offset int, limit int) (message.MessagesResponse, error)
	GetConversationMedia(conversationPartnerID string, currentUserID string, offset int, limit int) (message.ConversationMediaResponse, error)
	SendMessage(senderID string, recipientID string, textMessage string) (message.MessageDTO, error)
	GetUserNickname(userID string) (string, error)
}

type MessageServiceImpl struct {
	messageRepo    db.MessageRepository
	authRepository db.AuthRepository
	sessionManager *SessionManager
}

func NewMessageService(messageRepo db.MessageRepository, authRepository db.AuthRepository) MessageService {
	return MessageServiceImpl{
		messageRepo:    messageRepo,
		authRepository: authRepository,
		sessionManager: DefaultSessionManager,
	}
}

func (m MessageServiceImpl) GetMessages(conversationPartnerID string, currentUserID string, offset int, limit int) (message.MessagesResponse, error) {
	if conversationPartnerID == currentUserID {
		return message.MessagesResponse{}, realtimeforum.ErrBadRequest
	}

	if err := m.authRepository.DoesUserExists(conversationPartnerID); err != nil {
		return message.MessagesResponse{}, err
	}

	if allowed, err := m.messageRepo.CanMessage(currentUserID, conversationPartnerID); err != nil {
		return message.MessagesResponse{}, err
	} else if !allowed {
		return message.MessagesResponse{}, realtimeforum.ErrForbidden
	}

	messages, totalElements, err := m.messageRepo.GetMessages(conversationPartnerID, currentUserID, offset, limit)
	if err != nil {
		return message.MessagesResponse{}, err
	}

	dtos := make([]message.MessageDTO, len(messages))
	for i, msg := range messages {
		dtos[i] = message.MessageDTO{
			MessageId:   msg.MessageId,
			MediaURL:    msg.MediaURL,
			MediaType:   msg.MediaType,
			EditedAt:    msg.EditedAt,
			SenderId:    msg.SenderId,
			RecipientId: msg.RecipientId,
			TextMessage: msg.TextMessage,
			TimeStamp:   msg.TimeStamp,
			IsRead:      msg.IsRead,
			Score:       msg.Score,
			UserScore:   msg.UserScore,
		}
	}

	return message.MessagesResponse{
		Messages:      dtos,
		Offset:        offset,
		Limit:         limit,
		TotalElements: totalElements,
	}, nil
}

func (m MessageServiceImpl) GetConversationMedia(conversationPartnerID string, currentUserID string, offset int, limit int) (message.ConversationMediaResponse, error) {
	if conversationPartnerID == currentUserID {
		return message.ConversationMediaResponse{}, realtimeforum.ErrBadRequest
	}

	if err := m.authRepository.DoesUserExists(conversationPartnerID); err != nil {
		return message.ConversationMediaResponse{}, err
	}

	if allowed, err := m.messageRepo.CanMessage(currentUserID, conversationPartnerID); err != nil {
		return message.ConversationMediaResponse{}, err
	} else if !allowed {
		return message.ConversationMediaResponse{}, realtimeforum.ErrForbidden
	}

	messages, totalElements, err := m.messageRepo.GetConversationMedia(conversationPartnerID, currentUserID, offset, limit)
	if err != nil {
		return message.ConversationMediaResponse{}, err
	}

	items := make([]message.ConversationMediaItem, len(messages))
	for i, msg := range messages {
		items[i] = message.ConversationMediaItem{
			MessageId: msg.MessageId,
			MediaURL:  msg.MediaURL,
			MediaType: msg.MediaType,
			TimeStamp: msg.TimeStamp,
		}
	}

	return message.ConversationMediaResponse{
		Media:         items,
		Offset:        offset,
		Limit:         limit,
		TotalElements: totalElements,
	}, nil
}

func (m MessageServiceImpl) SendMessage(senderID string, recipientID string, textMessage string) (message.MessageDTO, error) {
	textMessage = strings.TrimSpace(textMessage)
	if utf8.RuneCountInString(textMessage) > 2000 {
		return message.MessageDTO{}, realtimeforum.ErrBadRequest
	}
	if senderID == recipientID {
		return message.MessageDTO{}, realtimeforum.ErrBadRequest
	}

	if err := m.authRepository.DoesUserExists(recipientID); err != nil {
		return message.MessageDTO{}, err
	}

	if allowed, err := m.messageRepo.CanMessage(senderID, recipientID); err != nil {
		return message.MessageDTO{}, err
	} else if !allowed {
		return message.MessageDTO{}, realtimeforum.ErrForbidden
	}

	msg, err := m.messageRepo.SaveMessage(senderID, recipientID, textMessage)
	if err != nil {
		return message.MessageDTO{}, err
	}

	return message.MessageDTO{
		MessageId:   msg.MessageId,
		MediaURL:    msg.MediaURL,
		MediaType:   msg.MediaType,
		EditedAt:    msg.EditedAt,
		SenderId:    msg.SenderId,
		RecipientId: msg.RecipientId,
		TextMessage: msg.TextMessage,
		TimeStamp:   msg.TimeStamp,
		IsRead:      msg.IsRead,
	}, nil
}

func (m MessageServiceImpl) GetUserNickname(userID string) (string, error) {
	return m.authRepository.GetUserNickname(userID)
}

func (m MessageServiceImpl) GetChatUsers(currentUserID string) ([]message.ChatUserDTO, error) {
	chatUsers, err := m.messageRepo.GetChatUsers(currentUserID)
	if err != nil {
		return nil, err
	}

	dtos := make([]message.ChatUserDTO, len(chatUsers))
	for i, cu := range chatUsers {
		isOnline := 0
		if m.sessionManager.IsUserOnline(cu.UserId) {
			isOnline = 1
		}

		lastMessageTime := ""
		if cu.LastMessageTime != nil {
			lastMessageTime = *cu.LastMessageTime
		}

		dtos[i] = message.ChatUserDTO{
			FirstName:       cu.FirstName,
			LastName:        cu.LastName,
			Avatar:          cu.Avatar,
			UserId:          cu.UserId,
			Nickname:        cu.Nickname,
			IsOnline:        isOnline,
			LastMessageTime: lastMessageTime,
		}
	}

	return dtos, nil
}
