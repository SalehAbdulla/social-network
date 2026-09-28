package handlers

import (
	"encoding/json"
	"net/http"
	realtimeforum "social-network/backend"
	"social-network/backend/pkg/middleware"
	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload"
	"social-network/backend/pkg/payload/notification"
	"strconv"
	"strings"
)

// notificationTypes resolves `?types=` and `?exclude=` into the entity types a
// request may see. Values are the entity type names, e.g. `?types=message` or
// `?exclude=message`, so one badge can count everything except private messages
// while the other counts only those. An unknown name is rejected instead of
// ignored: a silently dropped filter would render the wrong badge. `exclude`
// wins over `types`, and neither parameter means "every type".
func notificationTypes(r *http.Request) ([]string, error) {
	include := strings.TrimSpace(r.URL.Query().Get("types"))
	exclude := strings.TrimSpace(r.URL.Query().Get("exclude"))
	if include == "" && exclude == "" {
		return nil, nil
	}

	known := map[string]bool{}
	for _, entityType := range models.NotificationEntityTypes() {
		known[entityType] = true
	}

	selected := map[string]bool{}
	if include == "" {
		for entityType := range known {
			selected[entityType] = true
		}
	} else {
		for _, name := range strings.Split(include, ",") {
			name = strings.TrimSpace(name)
			if !known[name] {
				return nil, realtimeforum.ErrBadRequest
			}
			selected[name] = true
		}
	}
	for _, name := range strings.Split(exclude, ",") {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if !known[name] {
			return nil, realtimeforum.ErrBadRequest
		}
		delete(selected, name)
	}

	types := make([]string, 0, len(selected))
	for _, entityType := range models.NotificationEntityTypes() {
		if selected[entityType] {
			types = append(types, entityType)
		}
	}
	return types, nil
}

func (re *HandlerContext) GetNotifications(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	types, err := notificationTypes(r)
	if err != nil {
		re.HandleError(w, r, err)
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

	response, err := re.NotificationService.GetNotifications(userID, offset, limit, unreadOnly, types)
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

	types, err := notificationTypes(r)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	count, err := re.NotificationService.GetUnreadCount(userID, types)
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

	re.notificationsChanged(userID)
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

	re.notificationsChanged(userID)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[map[string]interface{}]{
		Success: true,
		Data: map[string]interface{}{
			"message": "All notifications marked as read",
		},
		Message: "All notifications marked as read",
	})
}

// Send only after the notification change commits so clients can fetch the new count.
func (re *HandlerContext) notificationsChanged(userID string) {
	if re.Hub == nil {
		return
	}
	data, _ := json.Marshal(map[string]any{"type": "notification_changed", "payload": map[string]any{}})
	re.Hub.SendToUser(userID, data)
}
