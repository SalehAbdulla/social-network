package handlers

import (
	"net/http"

	realtimeforum "social-network/backend"
)

// PostInsights is the author's own view of one post: who it reaches and how it has been
// received. It is deliberately not a shared endpoint — the numbers are about the post's
// audience and the post's author is the only account they concern.
//
// The order matters: read access is decided first, so a post the caller may not open
// answers the same 404 a read gives and this cannot be used to learn that a post exists;
// only then does "you did not write this" become a 403.
func (re *HandlerContext) PostInsights(w http.ResponseWriter, r *http.Request) {
	publicID := r.PathValue("postId")
	if publicID == "" {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}
	userID := currentUser(r)
	if userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}
	insights, err := re.PostService.PostInsights(publicID, userID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, insights)
}
