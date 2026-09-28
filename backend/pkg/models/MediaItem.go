package models

// MediaItem is one photo in a profile's merged media list: post photos and
// comment photos side by side, each pointing back at the post it belongs to.
type MediaItem struct {
	Url       string `json:"url"`
	PostId    int    `json:"postId"`
	Title     string `json:"title"`
	CreatedAt string `json:"createdAt"`
}
