package models

type MediaItem struct {
	Url       string `json:"url"`
	PostId    string `json:"postId"`
	Title     string `json:"title"`
	CreatedAt string `json:"createdAt"`
}
