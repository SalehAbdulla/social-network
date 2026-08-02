package models

type Message struct {
	MessageId   int
	SenderId    string
	RecipientId string
	TextMessage string
	TimeStamp   string
	IsRead      int
}