package handlers

import (
	"net/http"
	"strconv"

	realtimeforum "social-network/backend"
)

// postPathID reads the {postId} a route put in the path, refusing anything that
// is not a positive number before a query runs.
func postPathID(r *http.Request) (int, error) {
	postID, err := strconv.Atoi(r.PathValue("postId"))
	if err != nil || postID < 1 {
		return 0, realtimeforum.ErrBadRequest
	}
	return postID, nil
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
	postID, err := postPathID(r)
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
	respond(w, http.StatusOK, map[string]any{"postId": postID, "saved": true})
}

func (re *HandlerContext) UnsavePost(w http.ResponseWriter, r *http.Request) {
	postID, err := postPathID(r)
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
	respond(w, http.StatusOK, map[string]any{"postId": postID, "saved": false})
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
