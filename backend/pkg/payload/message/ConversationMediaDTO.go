package message

type ConversationMediaItem struct {
	MessageId int    `json:"messageId"`
	MediaURL  string `json:"mediaUrl"`
	MediaType string `json:"mediaType"`
	TimeStamp string `json:"timeStamp"`
}

type ConversationMediaResponse struct {
	Media         []ConversationMediaItem `json:"media"`
	Offset        int                     `json:"offset"`
	Limit         int                     `json:"limit"`
	TotalElements int                     `json:"totalElements"`
}
