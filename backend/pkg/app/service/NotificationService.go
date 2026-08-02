package service

import (
	realtimeforum "real-time-forum"
	db "real-time-forum/pkg/app/repositories"
	"real-time-forum/pkg/payload/notification"
)

type NotificationService interface {
	GetNotifications(userID string, offset, limit int, unreadOnly bool) (notification.NotificationResponse, error)
	GetUnreadCount(userID string) (int, error)
	CreateNotification(userID, actorID, entityType string, entityID int) (notification.NotificationDTO, error)
	MarkAsRead(notificationID int, userID string) error
	MarkAllAsRead(userID string) error
	MarkAsReadByActor(userID, actorID, entityType string) error
}

type NotificationServiceImpl struct {
	notificationRepo db.NotificationRepository
}

func NewNotificationService(notificationRepo db.NotificationRepository) NotificationService {
	return NotificationServiceImpl{
		notificationRepo: notificationRepo,
	}
}

func (n NotificationServiceImpl) GetNotifications(userID string, offset, limit int, unreadOnly bool) (notification.NotificationResponse, error) {
	notifications, totalElements, err := n.notificationRepo.GetNotifications(userID, offset, limit, unreadOnly)
	if err != nil {
		return notification.NotificationResponse{}, err
	}

	dtos := make([]notification.NotificationDTO, len(notifications))
	for i, notif := range notifications {
		dtos[i] = notification.NotificationDTO{
			NotificationId: notif.NotificationId,
			ActorId:        notif.ActorId,
			ActorNickname:  notif.ActorNickname,
			EntityType:     notif.EntityType,
			EntityId:       notif.EntityId,
			IsRead:         notif.IsRead,
			CreatedAt:      notif.CreatedAt,
		}
	}

	return notification.NotificationResponse{
		Notifications: dtos,
		Offset:        offset,
		Limit:         limit,
		TotalElements: totalElements,
	}, nil
}

func (n NotificationServiceImpl) GetUnreadCount(userID string) (int, error) {
	return n.notificationRepo.GetUnreadCount(userID)
}

func (n NotificationServiceImpl) CreateNotification(userID, actorID, entityType string, entityID int) (notification.NotificationDTO, error) {
	if entityType != "comment" && entityType != "message" {
		return notification.NotificationDTO{}, realtimeforum.ErrBadRequest
	}

	notif, err := n.notificationRepo.CreateNotification(userID, actorID, entityType, entityID)
	if err != nil {
		return notification.NotificationDTO{}, err
	}

	return notification.NotificationDTO{
		NotificationId: notif.NotificationId,
		ActorId:        notif.ActorId,
		ActorNickname:  notif.ActorNickname,
		EntityType:     notif.EntityType,
		EntityId:       notif.EntityId,
		IsRead:         notif.IsRead,
		CreatedAt:      notif.CreatedAt,
	}, nil
}

func (n NotificationServiceImpl) MarkAsRead(notificationID int, userID string) error {
	return n.notificationRepo.MarkAsRead(notificationID, userID)
}

func (n NotificationServiceImpl) MarkAllAsRead(userID string) error {
	return n.notificationRepo.MarkAllAsRead(userID)
}

func (n NotificationServiceImpl) MarkAsReadByActor(userID, actorID, entityType string) error {
	return n.notificationRepo.MarkAsReadByActor(userID, actorID, entityType)
}
