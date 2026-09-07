package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"social-network/backend/pkg/app/service"
	pkgwebsocket "social-network/backend/pkg/websocket"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func (re *HandlerContext) ServeWs(w http.ResponseWriter, r *http.Request) {

	var sessionToken string

	cookie, err := r.Cookie("session_token")
	if err == nil && cookie.Value != "" {
		sessionToken = cookie.Value
	} else {
		sessionToken = r.URL.Query().Get("token")
	}

	if sessionToken == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	userID, ok := service.DefaultSessionManager.GetUserIdByToken(sessionToken)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	socketUpgrader := upgrader
	socketUpgrader.CheckOrigin = re.allowedOrigin
	conn, err := socketUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}

	client := &pkgwebsocket.Client{
		Hub:    re.Hub,
		Conn:   conn,
		Send:   make(chan []byte, pkgwebsocket.SendBufferSize),
		UserID: userID,
	}

	re.Hub.Register <- client

	go client.WritePump()
	go client.ReadPump(re.handleWebSocketMessage)
}

func (re *HandlerContext) handleWebSocketMessage(client *pkgwebsocket.Client, messageType int, data []byte) {
	if messageType != websocket.TextMessage {
		return
	}

	var msg pkgwebsocket.WSMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		log.Printf("failed to unmarshal WebSocket message: %v", err)
		return
	}

	switch msg.Type {
	case pkgwebsocket.MsgTypePrivateMsg:
		re.handlePrivateMessage(client, msg)
	case pkgwebsocket.MsgTypeTyping:
		re.handleTyping(client, msg)
	case pkgwebsocket.MsgTypeTypingStopped:
		re.handleTypingStopped(client, msg)
	case pkgwebsocket.MsgTypeOpenChat:
		re.handleOpenChat(client, msg)
	case pkgwebsocket.MsgTypeCloseChat:
		re.handleCloseChat(client, msg)
	case pkgwebsocket.MsgTypeUserOffline:
		re.handleUserOffline(client)
	default:
		log.Printf("unknown message type from user %s: %s", client.UserID, msg.Type)
	}
}

func (re *HandlerContext) handlePrivateMessage(sender *pkgwebsocket.Client, msg pkgwebsocket.WSMessage) {

	var payload pkgwebsocket.PrivateMsgPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		log.Printf("failed to parse private_msg payload: %v", err)
		return
	}

	if payload.RecipientId == "" || payload.Text == "" {
		log.Printf("invalid private_msg payload: missing recipientId or text")
		return
	}

	savedMsg, err := re.MessageService.SendMessage(sender.UserID, payload.RecipientId, payload.Text)
	if err != nil {
		log.Printf("failed to save message: %v", err)
		return
	}

	senderNickname, err := re.MessageService.GetUserNickname(sender.UserID)
	if err != nil {
		senderNickname = sender.UserID
	}

	incomingPayload := pkgwebsocket.IncomingMsgPayload{
		MessageId:      savedMsg.MessageId,
		SenderId:       sender.UserID,
		SenderNickname: senderNickname,
		Text:           savedMsg.TextMessage,
		TimeStamp:      savedMsg.TimeStamp,
	}

	incomingData, err := json.Marshal(map[string]interface{}{
		"type":    pkgwebsocket.MsgTypeIncomingMsg,
		"payload": incomingPayload,
	})
	if err != nil {
		log.Printf("failed to marshal incoming message: %v", err)
		return
	}

	re.Hub.SendToUser(payload.RecipientId, incomingData)

	re.Hub.SendToUser(sender.UserID, incomingData)

	isRecipientViewingSender := false
	recipientClient := re.Hub.GetClientByUserID(payload.RecipientId)
	if recipientClient != nil && recipientClient.ChatPartner() == sender.UserID {
		isRecipientViewingSender = true
	}

	if !isRecipientViewingSender {
		notif, err := re.NotificationService.CreateNotification(payload.RecipientId, sender.UserID, "message", savedMsg.MessageId)
		if err != nil {
			log.Printf("failed to create notification for private message: %v", err)
			return
		}

		notifPayload := pkgwebsocket.NotificationPayload{
			NotificationId: notif.NotificationId,
			ActorId:        notif.ActorId,
			ActorNickname:  notif.ActorNickname,
			EntityType:     notif.EntityType,
			EntityId:       notif.EntityId,
			CreatedAt:      notif.CreatedAt,
		}

		notifData, err := json.Marshal(map[string]interface{}{
			"type":    pkgwebsocket.MsgTypeNotification,
			"payload": notifPayload,
		})
		if err != nil {
			log.Printf("failed to marshal notification: %v", err)
			return
		}

		re.Hub.SendToUser(payload.RecipientId, notifData)
	}
}

func (re *HandlerContext) handleTyping(client *pkgwebsocket.Client, msg pkgwebsocket.WSMessage) {
	var payload pkgwebsocket.TypingPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return
	}

	if payload.RecipientId == "" {
		return
	}

	if client.UserID != payload.SenderId {
		return
	}

	senderNickname, err := re.MessageService.GetUserNickname(client.UserID)
	if err != nil {
		senderNickname = client.UserID
	}

	typingData, err := json.Marshal(map[string]interface{}{
		"type": pkgwebsocket.MsgTypeTyping,
		"payload": pkgwebsocket.TypingPayload{
			SenderId:       client.UserID,
			RecipientId:    payload.RecipientId,
			SenderNickname: senderNickname,
		},
	})
	if err != nil {
		return
	}

	re.Hub.SendToUser(payload.RecipientId, typingData)
}

func (re *HandlerContext) handleOpenChat(client *pkgwebsocket.Client, msg pkgwebsocket.WSMessage) {
	var payload pkgwebsocket.OpenChatPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return
	}

	client.SetChatPartner(payload.PartnerId)

	re.NotificationService.MarkAsReadByActor(client.UserID, payload.PartnerId, "message")
}

func (re *HandlerContext) handleCloseChat(client *pkgwebsocket.Client, msg pkgwebsocket.WSMessage) {
	client.SetChatPartner("")
}

func (re *HandlerContext) handleUserOffline(client *pkgwebsocket.Client) {
	log.Printf("user %s requested to go offline via WebSocket", client.UserID)

	re.Hub.Unregister <- client
}

func (re *HandlerContext) handleTypingStopped(client *pkgwebsocket.Client, msg pkgwebsocket.WSMessage) {
	var payload pkgwebsocket.TypingPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return
	}

	if payload.RecipientId == "" {
		return
	}

	if client.UserID != payload.SenderId {
		return
	}

	senderNickname, err := re.MessageService.GetUserNickname(client.UserID)
	if err != nil {
		senderNickname = client.UserID
	}

	stoppedData, err := json.Marshal(map[string]interface{}{
		"type": pkgwebsocket.MsgTypeTypingStopped,
		"payload": pkgwebsocket.TypingPayload{
			SenderId:       client.UserID,
			RecipientId:    payload.RecipientId,
			SenderNickname: senderNickname,
		},
	})
	if err != nil {
		return
	}

	re.Hub.SendToUser(payload.RecipientId, stoppedData)
}

func (re *HandlerContext) SetHub(hub *pkgwebsocket.Hub) {
	re.Hub = hub
}
