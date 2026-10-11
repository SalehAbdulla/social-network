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
	Avatar          string   `json:"avatar"`
	// Whether the author's profile is public. A public post on a private profile is
	// visible to that profile's followers only, and the label has to say so.
	AuthorIsPublic  bool     `json:"authorIsPublic"`
	Title           string   `json:"title"`
	Content         string   `json:"content"`
	Score           int      `json:"score"`
	CommentsCounter int      `json:"commentsCounter"`
	UserScore       int      `json:"userScore"`
	IsSaved         bool     `json:"isSaved"`
	CreatedAt       string   `json:"createdAt"`
	UpdatedAt       string   `json:"updatedAt"`
}
