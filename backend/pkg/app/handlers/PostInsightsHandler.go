package handlers

import (
	"net/http"

	realtimeforum "social-network/backend"
)

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
