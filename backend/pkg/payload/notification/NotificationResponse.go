package notification

type NotificationResponse struct {
	Notifications []NotificationDTO `json:"notifications"`
	Offset        int               `json:"offset"`
	Limit         int               `json:"limit"`
	TotalElements int               `json:"totalElements"`
}

type UnreadCountResponse struct {
	Count int `json:"count"`
}

// UnreadCountsResponse is both sidebar badges in one answer: the bell (everything
// the sidebar shows except private messages) and the Messages entry (only those).
// It exists so the sidebar can ask once for the pair instead of twice for the two
// halves, which is what `?exclude=message` + `?types=message` used to cost.
type UnreadCountsResponse struct {
	Notifications int `json:"notifications"`
	Messages      int `json:"messages"`
}
