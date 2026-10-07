package comment

type CommentDTO struct {
	CommentId   int      `json:"commentId"`
	PostId      string   `json:"postId"`
	UserId      string   `json:"userId"`
	Nickname    string   `json:"nickname"`
	CommentText string   `json:"commentText"`
	ImageURLs   []string `json:"imageUrls"`
	Score       int      `json:"score"`
	UserScore   int      `json:"userScore"`
	CreatedAt   string   `json:"createdAt"`
}
