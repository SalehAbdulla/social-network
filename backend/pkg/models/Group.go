package models

type Group struct {
	ImageURL      string `json:"imageUrl"`
	GroupID       int    `json:"groupId"`
	OwnerID       string `json:"ownerId"`
	OwnerName     string `json:"ownerName"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	MemberCount   int    `json:"memberCount"`
	IsMember      bool   `json:"isMember"`
	IsOwner       bool   `json:"isOwner"`
	JoinRequested bool   `json:"joinRequested"`
	CreatedAt     string `json:"createdAt"`
}

type GroupMember struct {
	UserID    string `json:"userId"`
	Nickname  string `json:"nickname"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Avatar    string `json:"avatar"`
	Role      string `json:"role"`
	JoinedAt  string `json:"joinedAt"`
}

type GroupRequest struct {
	RequestID int    `json:"requestId"`
	GroupID   int    `json:"groupId"`
	UserID    string `json:"userId"`
	Nickname  string `json:"nickname"`
	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`
}

type GroupInvitation struct {
	InvitationID int    `json:"invitationId"`
	GroupID      int    `json:"groupId"`
	UserID       string `json:"userId"`
	Nickname     string `json:"nickname"`
	GroupTitle   string `json:"groupTitle"`
	Status       string `json:"status"`
	CreatedAt    string `json:"createdAt"`
}
