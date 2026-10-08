package models

func NotificationEntityTypes() []string {
	return []string{
		"comment",
		"message",
		"follow",
		"follow_request",
		"group_invitation",
		"group_request",
		"group_event",
	}
}

func IsNotificationEntityType(entityType string) bool {
	for _, known := range NotificationEntityTypes() {
		if known == entityType {
			return true
		}
	}
	return false
}

type Notification struct {
	NotificationId int
	UserId         string
	ActorId        string
	ActorNickname  string
	EntityType     string
	EntityId       int
	PostId         string
	IsRead         int
	CreatedAt      string
}
