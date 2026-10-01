package models

type Score int

const (
	Neutral Score = iota
	Like
	Dislike
)

type Post struct {
	ImageURLs       string
	PostId          int      `json:"postId"`
	UserId          string   `json:"userId"`
	Privacy         string   `json:"privacy"`
	SelectedUsers   []string `json:"selectedFollowerIds,omitempty"`
	Nickname        string   `json:"nickname"`
	Title           string   `json:"title"`
	Content         string   `json:"content"`
	Score           int      `json:"score"`
	CommentsCounter int      `json:"commentsCounter"`
	CreatedAt       string   `json:"createdAt"`
	UpdatedAt       string   `json:"updatedAt"`
	// IsSaved is viewer-relative and filled in by PostService, not by the SQL
	// projection: whether a post is bookmarked is a second lookup keyed on the
	// reader, so it is carried here rather than folded into every post query.
	IsSaved bool `json:"-"`
}
