package handlers

import (
	"encoding/json"
	"net/http"
	realtimeforum "social-network/backend"
	"social-network/backend/pkg/middleware"
	"social-network/backend/pkg/payload"
	"social-network/backend/pkg/payload/message"
	"strconv"
)

func (re *HandlerContext) GetChatMessages(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	conversationPartnerID := r.URL.Query().Get("partnerId")
	if conversationPartnerID == "" {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	offsetStr := r.URL.Query().Get("offset")
	if offsetStr == "" {
		offsetStr = "0"
	}

	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	limit := 10

	response, err := re.MessageService.GetMessages(conversationPartnerID, userID, offset, limit)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[message.MessagesResponse]{
		Success: true,
		Data:    response,
		Message: "Messages retrieved successfully",
	})
}

// mediaPageSize is how many attachments a page of the chat's media tab carries. A grid of
// tiles is denser than a column of messages, so it takes more rows per request than the
// thread's ten.
const mediaPageSize = 30

// GetConversationMedia is the chat's media tab: the attachments in one direct conversation,
// newest first. It reads `partnerId` and `offset` exactly as the thread does, so a page of
// tiles is fetched the way a page of messages is.
func (re *HandlerContext) GetConversationMedia(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	conversationPartnerID := r.URL.Query().Get("partnerId")
	if conversationPartnerID == "" {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	offsetStr := r.URL.Query().Get("offset")
	if offsetStr == "" {
		offsetStr = "0"
	}
	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	response, err := re.MessageService.GetConversationMedia(conversationPartnerID, userID, offset, mediaPageSize)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, response)
}

func (re *HandlerContext) GetChatUsers(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	users, err := re.MessageService.GetChatUsers(userID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	if re.Hub != nil {
		for i := range users {
			users[i].IsOnline = 0
			if re.Hub.IsUserOnline(users[i].UserId) {
				users[i].IsOnline = 1
			}
		}
	}
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[[]message.ChatUserDTO]{
		Success: true,
		Data:    users,
		Message: "Chat users retrieved successfully",
	})
}
