package models

type Score int

const (
	Neutral Score = iota
	Like
	Dislike
)

type Post struct {
	ImageURLs string
	// PostId is the table's own integer key. It is what comments, bookmarks, the
	// selected-follower grants and the polymorphic reaction table point at, so it never
	// leaves the server.
	PostId int `json:"-"`
	// PublicID is the UUID a post is addressed by outside the server — the API's `postId`
	// and every `?post=` URL. See migration 000020.
	PublicID      string   `json:"postId"`
	UserId        string   `json:"userId"`
	Privacy       string   `json:"privacy"`
	SelectedUsers []string `json:"selectedFollowerIds,omitempty"`
	Nickname      string   `json:"nickname"`
	// FirstName and LastName are the author's own name, carried beside the handle so a card
	// can head with it the way Instagram does: the name, the `@handle` under it. They come
	// from the same `user` join the handle does, so they cost no extra lookup.
	FirstName       string `json:"firstName"`
	LastName        string `json:"lastName"`
	Title           string `json:"title"`
	Content         string `json:"content"`
	Score           int    `json:"score"`
	CommentsCounter int    `json:"commentsCounter"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
	// IsSaved is viewer-relative and filled in by PostService, not by the SQL
	// projection: whether a post is bookmarked is a second lookup keyed on the
	// reader, so it is carried here rather than folded into every post query.
	IsSaved bool `json:"-"`
}
