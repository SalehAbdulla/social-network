package models

type Message struct {
	MediaURL    string
	MediaType   string
	EditedAt    string
	MessageId   int
	SenderId    string
	RecipientId string
	TextMessage string
	TimeStamp   string
	IsRead      int
}
