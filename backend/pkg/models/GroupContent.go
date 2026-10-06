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
	// Upcoming says whether an event is still to come, decided by the same SQL
	// that orders the events tab. The client splits its two sections on this
	// rather than on its own clock, so the sections and the order cannot disagree
	// — and a render stays a pure function of what the server sent.
	Upcoming bool `json:"upcoming"`
	// LikeCount and LikedByMe are a post's or a comment's likes, shaped the way the feed's
	// `score`/`userScore` pair is: a total for the row, and a flag for the reader asking.
	// The total is the denormalised `groupContent.score` column the reaction write keeps in
	// step, so a page of posts costs one query rather than one aggregate per item.
	LikeCount int  `json:"likeCount"`
	LikedByMe bool `json:"likedByMe"`
}
