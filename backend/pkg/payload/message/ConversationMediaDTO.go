package message

// ConversationMediaItem is one attachment in a direct conversation: enough to draw a tile
// and open it, and deliberately nothing else. The media tab has no use for the message's
// text, its read state or its reaction count, which is why it is not a MessageDTO — the
// profile media tab made the same choice with its own MediaItem.
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
