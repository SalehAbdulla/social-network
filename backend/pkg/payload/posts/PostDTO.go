package posts

type PostDTO struct {
	ImageURLs     []string `json:"imageUrls"`
	PostId        int      `json:"postId"`
	UserId        string   `json:"userId"`
	Privacy       string   `json:"privacy"`
	SelectedUsers []string `json:"selectedFollowerIds,omitempty"`
	Nickname      string   `json:"nickname"`
	// The author's own name, so a card can head with it and drop the `@handle` beneath, the
	// way the feed reads on Instagram. Empty for a caller that has not set one, which the
	// client falls back on the handle for.
	FirstName       string `json:"firstName"`
	LastName        string `json:"lastName"`
	Title           string `json:"title"`
	Content         string `json:"content"`
	Score           int    `json:"score"`
	CommentsCounter int    `json:"commentsCounter"`
	UserScore       int    `json:"userScore"`
	// IsSaved is viewer-relative: true when the signed-in member has this post in
	// their bookmark list. The frontend uses it to draw the save control.
	IsSaved   bool   `json:"isSaved"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}
