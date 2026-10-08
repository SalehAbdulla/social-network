package models

type SocialUser struct {
	UserID     string `json:"userId"`
	Nickname   string `json:"nickname"`
	FirstName  string `json:"firstName"`
	LastName   string `json:"lastName"`
	Bio        string `json:"bio"`
	Avatar     string `json:"avatar"`
	CoverPhoto string `json:"coverPhoto"`
	Location   string `json:"location"`

	Website      string `json:"website"`
	ContactEmail string `json:"contactEmail"`
	Phone        string `json:"phone"`

	ShowWebsite      bool `json:"showWebsite"`
	ShowContactEmail bool `json:"showContactEmail"`
	ShowPhone        bool `json:"showPhone"`

	IsPublic        bool     `json:"isPublic"`
	CreatedAt       string   `json:"createdAt"`
	Followers       []string `json:"followers"`
	Following       []string `json:"following"`
	PostCount       int      `json:"postCount"`
	PendingIncoming bool     `json:"pendingIncoming"`
	PendingOutgoing bool     `json:"pendingOutgoing"`
	CanMessage      bool     `json:"canMessage"`
}

type SavedAccount struct {
	UserID    string `json:"userId"`
	Nickname  string `json:"nickname"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Avatar    string `json:"avatar"`
}

type UserSuggestion struct {
	UserID      string   `json:"userId"`
	Nickname    string   `json:"nickname"`
	FirstName   string   `json:"firstName"`
	LastName    string   `json:"lastName"`
	Avatar      string   `json:"avatar"`
	IsPublic    bool     `json:"isPublic"`
	Mutuals     []string `json:"mutuals"`
	MutualCount int      `json:"mutualCount"`
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
	Viewed          bool   `json:"viewed"`

	Liked     bool `json:"liked"`
	LikeCount int  `json:"likeCount"`
}

type StoryViewer struct {
	UserID   string `json:"userId"`
	Nickname string `json:"nickname"`
	Avatar   string `json:"avatar"`
	ViewedAt string `json:"viewedAt"`
}

type StoryReply struct {
	ReplyID   int    `json:"replyId"`
	StoryID   int    `json:"storyId"`
	UserID    string `json:"userId"`
	Nickname  string `json:"nickname"`
	Avatar    string `json:"avatar"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}
