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
}
