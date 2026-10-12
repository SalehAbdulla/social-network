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
	// A reply carries the message it answers and that message's text and author,
	// so the bubble can show what was replied to. Zero/empty when not a reply.
	ReplyToId       int    `json:"replyToId"`
	ReplyToText     string `json:"replyToText"`
	ReplyToSenderId string `json:"replyToSenderId"`
}
