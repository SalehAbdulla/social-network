package models

type SocialUser struct {
	UserID     string   `json:"userId"`
	Nickname   string   `json:"nickname"`
	FirstName  string   `json:"firstName"`
	LastName   string   `json:"lastName"`
	Bio        string   `json:"bio"`
	Avatar     string   `json:"avatar"`
	CoverPhoto string   `json:"coverPhoto"`
	Location   string   `json:"location"`
	IsPublic   bool     `json:"isPublic"`
	CreatedAt  string   `json:"createdAt"`
	Followers  []string `json:"followers"`
	Following  []string `json:"following"`
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
