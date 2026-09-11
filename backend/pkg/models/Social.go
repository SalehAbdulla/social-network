package models

type SocialUser struct {
	UserID      string   `json:"userId"`
	Nickname    string   `json:"nickname"`
	FirstName   string   `json:"firstName"`
	LastName    string   `json:"lastName"`
	Bio         string   `json:"bio"`
	Avatar      string   `json:"avatar"`
	CoverPhoto  string   `json:"coverPhoto"`
	Location    string   `json:"location"`
	IsPublic    bool     `json:"isPublic"`
	CreatedAt   string   `json:"createdAt"`
	Followers   []string `json:"followers"`
	Following   []string `json:"following"`
	Connections []string `json:"connections"`
	Pending     []string `json:"pending"`
	Requested   []string `json:"requested"`
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
