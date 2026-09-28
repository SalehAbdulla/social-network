package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"unicode/utf8"

	backend "social-network/backend"
	"social-network/backend/pkg/payload/message"
)

func (re *HandlerContext) chatEvent(sender, recipient, event string, data any) {
	if re.Hub == nil {
		return
	}
	payload, _ := json.Marshal(map[string]any{"type": event, "payload": data})
	re.Hub.SendToUser(sender, payload)
	re.Hub.SendToUser(recipient, payload)
}

func (re *HandlerContext) SendChatMessage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RecipientID string `json:"recipientId"`
		Text        string `json:"text"`
		MediaURL    string `json:"mediaUrl"`
		MediaType   string `json:"mediaType"`
	}
	if !re.decode(w, r, &req) {
		return
	}
	sender := currentUser(r)
	req.Text = strings.TrimSpace(req.Text)
	if (req.Text == "" && req.MediaURL == "") || utf8.RuneCountInString(req.Text) > 2000 {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	if err := re.SocialService.CanMessage(sender, req.RecipientID); err != nil {
		re.HandleError(w, r, err)
		return
	}
	if req.MediaURL != "" {
		if req.MediaType != "image" && req.MediaType != "video" {
			re.HandleError(w, r, backend.ErrBadRequest)
			return
		}
		if err := re.SocialService.ValidateMedia(sender, req.MediaURL, req.MediaType); err != nil {
			re.HandleError(w, r, err)
			return
		}
	} else {
		req.MediaType = ""
	}
	saved, err := re.SocialService.Repo.SaveMessage(sender, req.RecipientID, req.Text, req.MediaURL, req.MediaType)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	data := message.MessageDTO{MessageId: saved.MessageId, SenderId: saved.SenderId, RecipientId: saved.RecipientId, TextMessage: saved.TextMessage, TimeStamp: saved.TimeStamp, IsRead: saved.IsRead, MediaURL: saved.MediaURL, MediaType: saved.MediaType, EditedAt: saved.EditedAt}
	re.chatEvent(sender, req.RecipientID, "message_changed", data)
	if notification, err := re.NotificationService.CreateNotification(req.RecipientID, sender, "message", saved.MessageId); err == nil && re.Hub != nil {
		encoded, _ := json.Marshal(map[string]any{"type": "notification", "payload": notification})
		re.Hub.SendToUser(req.RecipientID, encoded)
	} else if err != nil {
		re.App.Logger.Error("message notification failed", "error", err)
	}
	respond(w, http.StatusCreated, data)
}

func (re *HandlerContext) EditChatMessage(w http.ResponseWriter, r *http.Request) {
	id, ok := re.resourceID(w, r)
	if !ok {
		return
	}
	var req struct {
		Text string `json:"text"`
	}
	if !re.decode(w, r, &req) {
		return
	}
	req.Text = strings.TrimSpace(req.Text)
	if req.Text == "" || utf8.RuneCountInString(req.Text) > 2000 {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	sender, recipient, err := re.SocialService.Repo.MessageParticipants(id)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	if err = re.SocialService.Repo.EditMessage(id, currentUser(r), req.Text); err != nil {
		re.HandleError(w, r, err)
		return
	}
	re.chatEvent(sender, recipient, "message_changed", map[string]any{"messageId": id, "senderId": sender, "recipientId": recipient})
	respond(w, http.StatusOK, nil)
}

func (re *HandlerContext) DeleteChatMessage(w http.ResponseWriter, r *http.Request) {
	id, ok := re.resourceID(w, r)
	if !ok {
		return
	}
	scope := r.URL.Query().Get("scope")
	if scope != "me" && scope != "everyone" {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	sender, recipient, err := re.SocialService.Repo.MessageParticipants(id)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	if err = re.SocialService.Repo.DeleteMessage(id, currentUser(r), scope == "everyone"); err != nil {
		re.HandleError(w, r, err)
		return
	}
	if scope == "me" {
		sender, recipient = currentUser(r), currentUser(r)
	}
	re.chatEvent(sender, recipient, "message_changed", map[string]any{"messageId": id})
	respond(w, http.StatusOK, nil)
}

func (re *HandlerContext) ReadChat(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PartnerID string `json:"partnerId"`
	}
	if !re.decode(w, r, &req) {
		return
	}
	if err := re.SocialService.CanMessage(currentUser(r), req.PartnerID); err != nil {
		re.HandleError(w, r, err)
		return
	}
	changed, err := re.SocialService.Repo.MarkMessagesRead(currentUser(r), req.PartnerID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	if err := re.NotificationService.MarkAsReadByActor(currentUser(r), req.PartnerID, "message"); err != nil {
		re.HandleError(w, r, err)
		return
	}
	if changed {
		re.chatEvent(currentUser(r), req.PartnerID, "read_receipt", map[string]string{"readerId": currentUser(r), "partnerId": req.PartnerID})
	}
	respond(w, http.StatusOK, nil)
}
