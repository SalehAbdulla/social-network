package models

type Score int

const (
	Neutral Score = iota
	Like
	Dislike
)

type Post struct {
	ImageURLs       string
	PostId          int      `json:"-"`
	PublicID        string   `json:"postId"`
	UserId          string   `json:"userId"`
	Privacy         string   `json:"privacy"`
	SelectedUsers   []string `json:"selectedFollowerIds,omitempty"`
	Nickname        string   `json:"nickname"`
	FirstName       string   `json:"firstName"`
	LastName        string   `json:"lastName"`
	Title           string   `json:"title"`
	Content         string   `json:"content"`
	Score           int      `json:"score"`
	CommentsCounter int      `json:"commentsCounter"`
	CreatedAt       string   `json:"createdAt"`
	UpdatedAt       string   `json:"updatedAt"`
	IsSaved         bool     `json:"-"`
}
