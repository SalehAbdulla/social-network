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

	// The three optional public contact fields a profile may publish. They sit behind the
	// profile's Contact button (the website as a link), and like the bio they are cleared for
	// a viewer who is not allowed to see the profile at all.
	Website      string `json:"website"`
	ContactEmail string `json:"contactEmail"`
	Phone        string `json:"phone"`

	// A switch per contact field above. A field is published only while its own switch is on:
	// turning one off hides it from everyone but the owner without clearing what was typed, so
	// a viewer who may see the profile still sees just the parts its owner chose to share.
	ShowWebsite      bool `json:"showWebsite"`
	ShowContactEmail bool `json:"showContactEmail"`
	ShowPhone        bool `json:"showPhone"`

	IsPublic  bool     `json:"isPublic"`
	CreatedAt string   `json:"createdAt"`
	Followers []string `json:"followers"`
	Following []string `json:"following"`
	// PostCount is viewer-relative, like the two lists it sits beside: it counts the
	// posts this viewer may read, through the feed's own visibility fragment, so the
	// number on the profile header is the number of posts the page below can show.
	PostCount       int  `json:"postCount"`
	PendingIncoming bool `json:"pendingIncoming"`
	PendingOutgoing bool `json:"pendingOutgoing"`
	// CanMessage is viewer-relative: true when the viewer may start a private
	// chat with this user (public profile or a follow in either direction).
	CanMessage bool `json:"canMessage"`
}

// SavedAccount is one account a browser may switch to without signing in again.
// It is deliberately small — the switcher draws an avatar and two names — and it
// carries no session token: the token that actually performs the switch stays in
// a server-owned cookie and is never handed to the page (see handlers.Accounts).
type SavedAccount struct {
	UserID    string `json:"userId"`
	Nickname  string `json:"nickname"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Avatar    string `json:"avatar"`
}

// UserSuggestion is one account offered in the feed's "Suggested for you" list.
//
// It is deliberately a view of `SocialUser` rather than the whole thing: the rail never
// reads a suggestion's follows, bio or posts, and shipping them would hand the client a
// payload it has no use for. `Mutuals` and `MutualCount` are what the row's second line
// is worded from ("Followed by A + N more"); they are the people the viewer follows who
// also follow the candidate — the ranking signal, surfaced so the wording is not a guess.
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
	// Viewer-relative, like a post's `isSaved`: whether the account that asked for this
	// listing has a `storyView` row for the story. The stories strip draws the brand
	// gradient ring around an author avatar when this is false and a muted one when it
	// is true, so the flag is filled by the listing query rather than stored here.
	Viewed bool `json:"viewed"`

	// The heart. `Liked` is viewer-relative — a `reaction` row of this account's with score
	// 1 — and `LikeCount` is the story's total, both folded in by the listing query so a
	// reader sees the state they left behind without a second request.
	Liked     bool `json:"liked"`
	LikeCount int  `json:"likeCount"`
}

// StoryViewer is one account in a story's "seen by" list, which only the story's author is
// offered. It is deliberately small: the author needs the person and the moment they looked,
// and nothing about the story, which the caller already holds.
type StoryViewer struct {
	UserID   string `json:"userId"`
	Nickname string `json:"nickname"`
	Avatar   string `json:"avatar"`
	ViewedAt string `json:"viewedAt"`
}

// StoryReply is one reply left on a story, read back to the story's author alone. It carries
// the reply's author the way a comment does, because that is the only face the reader sees on
// it, and the story it answers, so a reader holding several stories can tell them apart.
type StoryReply struct {
	ReplyID   int    `json:"replyId"`
	StoryID   int    `json:"storyId"`
	UserID    string `json:"userId"`
	Nickname  string `json:"nickname"`
	Avatar    string `json:"avatar"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}
