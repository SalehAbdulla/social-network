package models

type Score int

const (
	Neutral Score = iota
	Like
	Dislike
)

type Post struct {
	PostId          int    `json:"postId"`
	UserId          string `json:"userId"`
	Nickname        string `json:"nickname"`
	Title           string `json:"title"`
	Content         string `json:"content"`
	CategoryId      int    `json:"categoryId"`
	CategoryName    string `json:"categoryName"`
	Score           int    `json:"score"`
	CommentsCounter int    `json:"commentsCounter"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}