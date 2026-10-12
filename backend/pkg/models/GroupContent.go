package models

type GroupContent struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	ID        int    `json:"id"`
	GroupID   int    `json:"groupId"`
	UserID    string `json:"userId"`
	Nickname  string `json:"nickname"`
	Kind      string `json:"kind"`
	ParentID  int    `json:"parentId"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	MediaURL  string `json:"mediaUrl"`
	StartsAt  string `json:"startsAt"`
	CreatedAt string `json:"createdAt"`
	RSVP      string `json:"rsvp"`
	Going     int    `json:"going"`
	NotGoing  int    `json:"notGoing"`
	Upcoming  bool   `json:"upcoming"`
	LikeCount int    `json:"likeCount"`
	LikedByMe bool   `json:"likedByMe"`
	// A group chat message can answer an earlier one; the parent's text and
	// author travel with it so the bubble shows what was replied to. Zero/empty
	// when the item is not a reply.
	ReplyToId       int    `json:"replyToId"`
	ReplyToText     string `json:"replyToText"`
	ReplyToSenderId string `json:"replyToSenderId"`
}
