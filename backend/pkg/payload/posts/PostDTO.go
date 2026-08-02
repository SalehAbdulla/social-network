package posts

type PostDTO struct {
	PostId          int    `json:"postId"`
	UserId          string `json:"userId"`
	Nickname        string `json:"nickname"`
	Title           string `json:"title"`
	Content         string `json:"content"`
	CategoryId      int    `json:"categoryId"`
	CategoryName    string `json:"categoryName"`
	Score           int    `json:"score"`
	CommentsCounter int    `json:"commentsCounter"`
	UserScore       int    `json:"userScore"` 
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}
