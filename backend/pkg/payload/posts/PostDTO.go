package posts

type PostDTO struct {
	ImageURLs       []string `json:"imageUrls"`
	PostId          int      `json:"postId"`
	UserId          string   `json:"userId"`
	Privacy         string   `json:"privacy"`
	SelectedUsers   []string `json:"selectedFollowerIds,omitempty"`
	Nickname        string   `json:"nickname"`
	Title           string   `json:"title"`
	Content         string   `json:"content"`
	Score           int      `json:"score"`
	CommentsCounter int      `json:"commentsCounter"`
	UserScore       int      `json:"userScore"`
	// IsSaved is viewer-relative: true when the signed-in member has this post in
	// their bookmark list. The frontend uses it to draw the save control.
	IsSaved   bool   `json:"isSaved"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}
