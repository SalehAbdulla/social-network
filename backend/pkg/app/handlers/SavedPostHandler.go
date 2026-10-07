package handlers

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"

	realtimeforum "social-network/backend"
)

// resolvePostID turns the public UUID a route path or query carries into the post table's own
// integer key, which every internal read and write is keyed on. A value that is not a UUID is a
// 400 — a client that mangled the id — while a well-formed id that matches no row is the same 404
// a post read gives, so the resolver cannot be used to learn which posts exist.
func (re *HandlerContext) resolvePostID(publicID string) (int, error) {
	if _, err := uuid.Parse(publicID); err != nil {
		return 0, realtimeforum.ErrBadRequest
	}
	return re.SocialService.Repo.PostIDByPublicID(publicID)
}

// pageParams reads the `page`/`size` pair the list endpoints share, with the same
// defaults and the same 100-row ceiling GET /api/v1/posts enforces, so paging the
// saved list behaves like paging the feed.
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

// SavePost adds a post to the caller's private bookmark list. Both this and
// UnsavePost answer with the resulting state, because both are idempotent: the
// second press of a save button is not a conflict.
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

// SavedPosts is the caller's bookmark list, in the feed's response shape.
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
