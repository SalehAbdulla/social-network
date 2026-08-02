package handlers

import (
	"encoding/json"
	"net/http"
	realtimeforum "real-time-forum"
	"real-time-forum/pkg/middleware"
	"real-time-forum/pkg/payload"
	"real-time-forum/pkg/payload/notification"
	"strconv"
)

func (re *HandlerContext) GetNotifications(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
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

	limitStr := r.URL.Query().Get("limit")
	if limitStr == "" {
		limitStr = "10"
	}

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	unreadOnly := r.URL.Query().Get("unread") == "true"

	response, err := re.NotificationService.GetNotifications(userID, offset, limit, unreadOnly)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[notification.NotificationResponse]{
		Success: true,
		Data:    response,
		Message: "Notifications retrieved successfully",
	})
}

func (re *HandlerContext) GetUnreadCount(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	count, err := re.NotificationService.GetUnreadCount(userID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[notification.UnreadCountResponse]{
		Success: true,
		Data: notification.UnreadCountResponse{
			Count: count,
		},
		Message: "Unread count retrieved successfully",
	})
}

func (re *HandlerContext) MarkAsRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	notificationIDStr := r.PathValue("notificationId")
	if notificationIDStr == "" {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	notificationID, err := strconv.Atoi(notificationIDStr)
	if err != nil || notificationID < 1 {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	if err := re.NotificationService.MarkAsRead(notificationID, userID); err != nil {
		re.HandleError(w, r, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[map[string]interface{}]{
		Success: true,
		Data: map[string]interface{}{
			"notificationId": notificationID,
			"isRead":         1,
		},
		Message: "Notification marked as read",
	})
}

func (re *HandlerContext) MarkAllAsRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	if err := re.NotificationService.MarkAllAsRead(userID); err != nil {
		re.HandleError(w, r, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[map[string]interface{}]{
		Success: true,
		Data: map[string]interface{}{
			"message": "All notifications marked as read",
		},
		Message: "All notifications marked as read",
	})
}