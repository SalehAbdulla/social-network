package message

type ChatUserDTO struct {
	UserId          string `json:"userId"`
	Nickname        string `json:"nickname"`
	IsOnline        int    `json:"isOnline"`
	LastMessageTime string `json:"lastMessageTime"`
}