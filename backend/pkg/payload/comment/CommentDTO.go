package comment

type CommentDTO struct {
	CommentId   int    `json:"commentId"`
	PostId      int    `json:"postId"`
	UserId      string `json:"userId"`
	Nickname    string `json:"nickname"`
	CommentText string `json:"commentText"`
	Score       int    `json:"score"`
	UserScore   int    `json:"userScore"`
	CreatedAt   string `json:"createdAt"`
}