package models

type SocialUser struct {
	UserID          string   `json:"userId"`
	Nickname        string   `json:"nickname"`
	FirstName       string   `json:"firstName"`
	LastName        string   `json:"lastName"`
	Bio             string   `json:"bio"`
	Avatar          string   `json:"avatar"`
	CoverPhoto      string   `json:"coverPhoto"`
	Location        string   `json:"location"`
	IsPublic        bool     `json:"isPublic"`
	CreatedAt       string   `json:"createdAt"`
	Followers       []string `json:"followers"`
	Following       []string `json:"following"`
	PendingIncoming bool     `json:"pendingIncoming"`
	PendingOutgoing bool     `json:"pendingOutgoing"`
	// CanMessage is viewer-relative: true when the viewer may start a private
	// chat with this user (public profile or a follow in either direction).
	CanMessage bool `json:"canMessage"`
}

type FollowRequest struct {
	UserID    string `json:"userId"`
	Nickname  string `json:"nickname"`
	CreatedAt string `json:"createdAt"`
}

type Story struct {
	StoryID         int    `json:"storyId"`
	UserID          string `json:"userId"`
	Nickname        string `json:"nickname"`
	Avatar          string `json:"avatar"`
	Content         string `json:"content"`
	MediaURL        string `json:"mediaUrl"`
	MediaType       string `json:"mediaType"`
	BackgroundColor string `json:"backgroundColor"`
	CreatedAt       string `json:"createdAt"`
	ExpiresAt       string `json:"expiresAt"`
}
