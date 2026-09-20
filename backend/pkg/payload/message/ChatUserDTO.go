package message

type ChatUserDTO struct {
	FirstName       string `json:"firstName"`
	LastName        string `json:"lastName"`
	Avatar          string `json:"avatar"`
	UserId          string `json:"userId"`
	Nickname        string `json:"nickname"`
	IsOnline        int    `json:"isOnline"`
	LastMessageTime string `json:"lastMessageTime"`
}
