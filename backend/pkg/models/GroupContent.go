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
}
