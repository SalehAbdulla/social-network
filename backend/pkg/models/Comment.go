package models

type Comment struct {
	CommentId int `json:"commentId"`
	PostId    int `json:"-"`
	// PostPublicID is the post's public UUID, carried beside the row's own integer key so
	// the API answer names the post the same way every other endpoint does.
	PostPublicID string `json:"postId"`
	UserId       string `json:"userId"`
	Nickname     string `json:"nickname"`
	CommentText  string `json:"commentText"`
	// ImageURLs is the raw JSON array held in comment.imageUrls, exactly like
	// models.Post.ImageURLs. The DTO mapping decodes it.
	ImageURLs string `json:"-"`
	Score     int    `json:"score"`
	UserScore int    `json:"userScore"`
	CreatedAt string `json:"createdAt"`
}
