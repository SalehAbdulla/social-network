package message

type MessagesResponse struct {
	Messages      []MessageDTO `json:"messages"`
	Offset        int          `json:"offset"`
	Limit         int          `json:"limit"`
	TotalElements int          `json:"totalElements"`
}