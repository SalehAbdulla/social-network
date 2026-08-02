package handlers

import (
	"encoding/json"
	"net/http"
	realtimeforum "real-time-forum"
	"real-time-forum/pkg/middleware"
	"real-time-forum/pkg/payload"
	"real-time-forum/pkg/payload/message"
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

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[[]message.ChatUserDTO]{
		Success: true,
		Data:    users,
		Message: "Chat users retrieved successfully",
	})
}
