package models

type Notification struct {
	NotificationId int
	UserId         string
	ActorId        string
	ActorNickname  string
	EntityType     string
	EntityId       int
	PostId         int
	IsRead         int
	CreatedAt      string
}
