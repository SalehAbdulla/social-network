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

// IsNotificationEntityType reports whether the API exposes this entityType. The
// service validates creation with it, so the whitelist cannot drift from the
// list the SQL and the query filters use.
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
	// PostId is the commented post's public UUID, empty for a type that carries none.
	PostId    string
	IsRead    int
	CreatedAt string
}
