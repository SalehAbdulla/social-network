package models

// MediaItem is one photo in a profile's merged media list: post photos and
// comment photos side by side, each pointing back at the post it belongs to.
type MediaItem struct {
	Url string `json:"url"`
	// PostId is the public UUID of the post this photo belongs to (see migration 000020),
	// so a media tile links to a `/post/<uuid>` page like every other post reference.
	PostId    string `json:"postId"`
	Title     string `json:"title"`
	CreatedAt string `json:"createdAt"`
}
