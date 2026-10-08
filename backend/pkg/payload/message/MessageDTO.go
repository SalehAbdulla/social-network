package message

type MessageDTO struct {
	MediaURL    string `json:"mediaUrl"`
	MediaType   string `json:"mediaType"`
	EditedAt    string `json:"editedAt"`
	MessageId   int    `json:"messageId"`
	SenderId    string `json:"senderId"`
	RecipientId string `json:"recipientId"`
	TextMessage string `json:"textMessage"`
	TimeStamp   string `json:"timeStamp"`
	IsRead      int    `json:"isRead"`
	Score       int    `json:"score"`
	UserScore   int    `json:"userScore"`
}
