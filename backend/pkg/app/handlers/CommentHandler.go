package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	realtimeforum "real-time-forum"
	"real-time-forum/pkg/middleware"
	"real-time-forum/pkg/payload"
	"real-time-forum/pkg/payload/comment"
	pkgwebsocket "real-time-forum/pkg/websocket"
	"strconv"
	"strings"
)

func (re *HandlerContext) GetComments(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	postId := strings.TrimSpace(r.URL.Query().Get("postId"))
	if postId == "" {
		re.HandleError(w, r, realtimeforum.ErrMissingPostId)
		return
	}

	postIdInt, err := strconv.Atoi(postId)
	if err != nil {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	pageNumberStr := r.URL.Query().Get("page")
	if pageNumberStr == "" {
		pageNumberStr = "1"
	}

	pageSizeStr := r.URL.Query().Get("size")
	if pageSizeStr == "" {
		pageSizeStr = "10"
	}

	sortBy := strings.TrimSpace(r.URL.Query().Get("sortBy"))
	if sortBy == "" {
		sortBy = "createdAt"
	}

	sortOrder := strings.TrimSpace(r.URL.Query().Get("sortOrder"))
	if sortOrder == "" {
		sortOrder = "desc"
	}

	pageNumber, err := strconv.Atoi(pageNumberStr)
	if err != nil || pageNumber < 1 {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	pageSize, err := strconv.Atoi(pageSizeStr)
	if err != nil || pageSize < 1 {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	response, err := re.CommentService.GetComments(postIdInt, pageNumber, pageSize, sortBy, sortOrder, userID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[comment.CommentResponse]{
		Success: true,
		Data:    response,
		Message: "Comments retrieved successfully",
	})
}

func (re *HandlerContext) CreateComments(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	if !re.parseForm(w, r) {
		return
	}

	postIdStr := strings.TrimSpace(r.FormValue("postId"))
	if postIdStr == "" {
		re.HandleError(w, r, realtimeforum.ErrMissingPostId)
		return
	}

	postId, err := strconv.Atoi(postIdStr)
	if err != nil {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	content := strings.TrimSpace(r.FormValue("content"))
	if content == "" || len(content) < 3 || len(content) > 300 {
		re.HandleError(w, r, realtimeforum.ErrCommentLength)
		return
	}

	if !isASCII(content) {
		re.HandleError(w, r, realtimeforum.ErrNonASCII)
		return
	}

	response, err := re.CommentService.CreateComment(userID, postId, content)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	re.App.Logger.Info("comment created successfully",
		"comment_id", response.CommentId,
		"post_id", response.PostId,
		"user_id", userID,
	)

	post, err := re.PostService.GetPostByID(postId, userID)
	if err == nil && post.UserId != userID {
		notif, err := re.NotificationService.CreateNotification(post.UserId, userID, "comment", response.CommentId)
		if err != nil {
			log.Printf("failed to create notification for comment: %v", err)
		} else {
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
			} else {
				re.Hub.SendToUser(post.UserId, notifData)
			}
		}
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(payload.SuccessResponse[comment.CommentDTO]{
		Success: true,
		Data:    response,
		Message: "Comment created successfully",
	})
}

func (re *HandlerContext) DeleteComment(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	commentIdStr := strings.TrimSpace(r.URL.Query().Get("id"))
	if commentIdStr == "" {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	commentId, err := strconv.Atoi(commentIdStr)
	if err != nil {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	if err := re.CommentService.DeleteComment(commentId, userID); err != nil {
		re.HandleError(w, r, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[any]{
		Success: true,
		Data:    nil,
		Message: "Comment deleted successfully",
	})
}
