package posts

type PostDTO struct {
	ImageURLs       []string `json:"imageUrls"`
	PostId          string   `json:"postId"`
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
	UserScore       int      `json:"userScore"`
	IsSaved         bool     `json:"isSaved"`
	CreatedAt       string   `json:"createdAt"`
	UpdatedAt       string   `json:"updatedAt"`
}
