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
	Score       int
	UserScore   int
	// The message this one answers, plus the parent's text and author so a
	// reader can see what was replied to without a second request. Both are
	// empty when the message is not a reply (replyToId is 0).
	ReplyToId       int
	ReplyToText     string
	ReplyToSenderId string
}
