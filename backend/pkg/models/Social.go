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

	// The account's own details. They are filled only for the member reading their
	// own profile — `writeProfile` merges them in — so every other surface that
	// reuses this struct (discover, the follow lists, a post's author) leaves them
	// empty and cannot leak them.
	Email     string `json:"email,omitempty"`
	BirthDate string `json:"birthDate,omitempty"`
	Gender    string `json:"gender,omitempty"`

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

// MaskPrivateDetails clears everything a viewer who may not read a private profile
// is not allowed to see, and leaves the handle and the display name — they are what
// a search result, a follow request and a follower row are made of, and without them
// nobody could be found at all. Every list that carries other people's profiles
// (discover, the follow lists, suggestions) runs this before answering; the single
// profile view masks more, because there is nothing left to identify.
func (u *SocialUser) MaskPrivateDetails() {
	u.Bio, u.Location = "", ""
	u.Website, u.ContactEmail, u.Phone = "", "", ""
	u.ShowWebsite, u.ShowContactEmail, u.ShowPhone = false, false, false
	u.Avatar, u.CoverPhoto = "", ""
	u.Email, u.BirthDate, u.Gender = "", "", ""
	u.Followers, u.Following = []string{}, []string{}
	u.PostCount = 0
	// PendingIncoming and PendingOutgoing stay: they are the viewer's own state —
	// "I asked them", "they asked me" — and the follow button is drawn from them.
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
	StoryID             int      `json:"storyId"`
	UserID              string   `json:"userId"`
	Nickname            string   `json:"nickname"`
	Avatar              string   `json:"avatar"`
	Content             string   `json:"content"`
	MediaURL            string   `json:"mediaUrl"`
	MediaType           string   `json:"mediaType"`
	BackgroundColor     string   `json:"backgroundColor"`
	Privacy             string   `json:"privacy"`
	SelectedFollowerIds []string `json:"selectedFollowerIds"`
	CreatedAt           string   `json:"createdAt"`
	ExpiresAt           string   `json:"expiresAt"`
	Viewed              bool     `json:"viewed"`

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
