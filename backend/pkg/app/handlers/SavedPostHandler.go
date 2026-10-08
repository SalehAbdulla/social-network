package handlers

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"

	realtimeforum "social-network/backend"
)

func (re *HandlerContext) resolvePostID(publicID string) (int, error) {
	if _, err := uuid.Parse(publicID); err != nil {
		return 0, realtimeforum.ErrBadRequest
	}
	return re.SocialService.Repo.PostIDByPublicID(publicID)
}

func (re *HandlerContext) pageParams(w http.ResponseWriter, r *http.Request) (int, int, bool) {
	pageNumber, pageSize := 1, 10
	if raw := r.URL.Query().Get("page"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 {
			re.HandleError(w, r, realtimeforum.ErrBadRequest)
			return 0, 0, false
		}
		pageNumber = value
	}
	if raw := r.URL.Query().Get("size"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 100 {
			re.HandleError(w, r, realtimeforum.ErrBadRequest)
			return 0, 0, false
		}
		pageSize = value
	}
	return pageNumber, pageSize, true
}

func (re *HandlerContext) SavePost(w http.ResponseWriter, r *http.Request) {
	publicID := r.PathValue("postId")
	postID, err := re.resolvePostID(publicID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	userID := currentUser(r)
	if userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}
	if err := re.PostService.SavePost(userID, postID); err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, map[string]any{"postId": publicID, "saved": true})
}

func (re *HandlerContext) UnsavePost(w http.ResponseWriter, r *http.Request) {
	publicID := r.PathValue("postId")
	postID, err := re.resolvePostID(publicID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	userID := currentUser(r)
	if userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}
	if err := re.PostService.UnsavePost(userID, postID); err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, map[string]any{"postId": publicID, "saved": false})
}

func (re *HandlerContext) SavedPosts(w http.ResponseWriter, r *http.Request) {
	pageNumber, pageSize, ok := re.pageParams(w, r)
	if !ok {
		return
	}
	response, err := re.PostService.GetSavedPosts(pageNumber, pageSize, currentUser(r))
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, response)
}
