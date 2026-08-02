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