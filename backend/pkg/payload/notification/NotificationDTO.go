package notification

type NotificationDTO struct {
	NotificationId int    `json:"notificationId"`
	ActorId        string `json:"actorId"`
	ActorNickname  string `json:"actorNickname"`
	EntityType     string `json:"entityType"`
	EntityId       int    `json:"entityId"`
	IsRead         int    `json:"isRead"`
	CreatedAt      string `json:"createdAt"`
}