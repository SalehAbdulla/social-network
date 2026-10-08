package websocket

import "encoding/json"

const (
	MsgTypePrivateMsg = "private_msg"

	MsgTypeIncomingMsg   = "incoming_msg"
	MsgTypeUserStatus    = "user_status"
	MsgTypeNotification  = "notification"
	MsgTypeSendError     = "send_error"
	MsgTypeTyping        = "typing"
	MsgTypeTypingStopped = "typing_stopped"
	MsgTypeOpenChat      = "open_chat"
	MsgTypeCloseChat     = "close_chat"
	MsgTypeUserOffline   = "user_offline"

	MsgTypeMessageChanged      = "message_changed"
	MsgTypeReadReceipt         = "read_receipt"
	MsgTypeSocialChanged       = "social_changed"
	MsgTypeGroupChanged        = "group_changed"
	MsgTypeNotificationChanged = "notification_changed"
	MsgTypePostChanged         = "post_changed"
)

type WSMessage struct {
	Type           string          `json:"type"`
	Payload        json.RawMessage `json:"payload,omitempty"`
	SenderId       string          `json:"senderId,omitempty"`
	RecipientId    string          `json:"recipientId,omitempty"`
	Text           string          `json:"text,omitempty"`
	TimeStamp      string          `json:"timeStamp,omitempty"`
	SenderNickname string          `json:"senderNickname,omitempty"`
}

type PrivateMsgPayload struct {
	RecipientId string `json:"recipientId"`
	Text        string `json:"text"`
}

type IncomingMsgPayload struct {
	MessageId      int    `json:"messageId"`
	SenderId       string `json:"senderId"`
	SenderNickname string `json:"senderNickname"`
	Text           string `json:"text"`
	TimeStamp      string `json:"timeStamp"`
}

type UserStatusPayload struct {
	UserId   string `json:"userId"`
	IsOnline int    `json:"isOnline"`
}

type NotificationPayload struct {
	NotificationId int    `json:"notificationId"`
	ActorId        string `json:"actorId"`
	ActorNickname  string `json:"actorNickname"`
	EntityType     string `json:"entityType"`
	EntityId       int    `json:"entityId"`
	CreatedAt      string `json:"createdAt"`
}

type SendErrorPayload struct {
	RecipientId string `json:"recipientId"`
	Message     string `json:"message"`
}

type TypingPayload struct {
	SenderId       string `json:"senderId"`
	RecipientId    string `json:"recipientId"`
	SenderNickname string `json:"senderNickname,omitempty"`
}

type OpenChatPayload struct {
	PartnerId string `json:"partnerId"`
}
