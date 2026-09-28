package models

// NotificationEntityTypes is the allow-list of entityType values the API
// exposes, in the order the filters echo them back. It lives here so the SQL,
// the query-parameter validation and the tests cannot drift apart.
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
