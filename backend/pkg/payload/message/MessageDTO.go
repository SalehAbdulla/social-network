package message

type MessageDTO struct {
	MessageId   int    `json:"messageId"`
	SenderId    string `json:"senderId"`
	RecipientId string `json:"recipientId"`
	TextMessage string `json:"textMessage"`
	TimeStamp   string `json:"timeStamp"`
	IsRead      int    `json:"isRead"`
}