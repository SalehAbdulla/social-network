package models

type Comment struct {
	CommentId    int    `json:"commentId"`
	PostId       int    `json:"-"`
	PostPublicID string `json:"postId"`
	UserId       string `json:"userId"`
	Nickname     string `json:"nickname"`
	CommentText  string `json:"commentText"`
	ImageURLs    string `json:"-"`
	Score        int    `json:"score"`
	UserScore    int    `json:"userScore"`
	CreatedAt    string `json:"createdAt"`
}
