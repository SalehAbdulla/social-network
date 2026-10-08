package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	realtimeforum "social-network/backend"
	"social-network/backend/pkg/middleware"
	"social-network/backend/pkg/payload"
	"social-network/backend/pkg/payload/comment"
	pkgwebsocket "social-network/backend/pkg/websocket"
	"strconv"
	"strings"
	"unicode/utf8"
)

func (re *HandlerContext) GetComments(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	postIdStr := strings.TrimSpace(r.URL.Query().Get("postId"))
	if postIdStr == "" {
		re.HandleError(w, r, realtimeforum.ErrMissingPostId)
		return
	}

	postIdInt, err := re.resolvePostID(postIdStr)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	if _, err := re.PostService.GetPostByID(postIdInt, userID); err != nil {
		re.HandleError(w, r, err)
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

const maxCommentImages = 4

type createCommentRequest struct {
	PostID    string   `json:"postId"`
	Content   string   `json:"content"`
	ImageURLs []string `json:"imageUrls"`
}

func (re *HandlerContext) CreateComments(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	req, valid := re.commentInput(w, r, userID)
	if !valid {
		return
	}
	postId, err := re.resolvePostID(req.PostID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	if _, err := re.PostService.GetPostByID(postId, userID); err != nil {
		re.HandleError(w, r, err)
		return
	}

	response, err := re.CommentService.CreateComment(userID, postId, req.Content, req.ImageURLs)
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

func (re *HandlerContext) commentInput(w http.ResponseWriter, r *http.Request, userID string) (createCommentRequest, bool) {
	var req createCommentRequest
	if !re.parseForm(w, r) {
		return req, false
	}

	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			re.HandleError(w, r, realtimeforum.ErrBadRequest)
			return req, false
		}
		if strings.TrimSpace(req.PostID) == "" {
			re.HandleError(w, r, realtimeforum.ErrMissingPostId)
			return req, false
		}
	} else {
		req.PostID = strings.TrimSpace(r.FormValue("postId"))
		if req.PostID == "" {
			re.HandleError(w, r, realtimeforum.ErrMissingPostId)
			return req, false
		}
		req.Content = r.FormValue("content")
		req.ImageURLs = r.Form["imageUrls"]
	}

	content := strings.TrimSpace(req.Content)
	if content == "" || utf8.RuneCountInString(content) < 3 || utf8.RuneCountInString(content) > 300 {
		re.HandleError(w, r, realtimeforum.ErrCommentLength)
		return req, false
	}

	if len(req.ImageURLs) > maxCommentImages {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return req, false
	}
	for _, url := range req.ImageURLs {
		if url == "" {
			re.HandleError(w, r, realtimeforum.ErrBadRequest)
			return req, false
		}
		if err := re.SocialService.ValidateMedia(userID, url, "image"); err != nil {
			re.HandleError(w, r, err)
			return req, false
		}
	}
	req.Content = content
	return req, true
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
