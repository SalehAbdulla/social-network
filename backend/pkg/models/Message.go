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
	// Score is the message's reaction total and UserScore is the reader's own, both
	// viewer-relative and filled by the repository's query — a message keeps no
	// denormalised column of its own (see ReactionRepository.UpsertReaction).
	Score     int
	UserScore int
}
