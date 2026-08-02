package handlers

import (
	"encoding/json"
	"net/http"
	realtimeforum "real-time-forum"
	"real-time-forum/pkg/middleware"
	"real-time-forum/pkg/payload"
	"real-time-forum/pkg/payload/reaction"
	"strings"
)

type ReactRequest struct {
	EntityType string `json:"entityType"`
	EntityId   int    `json:"entityId"`
	Score      int    `json:"score"`
}

func (re *HandlerContext) React(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	var req ReactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}
	req.EntityType = strings.TrimSpace(strings.ToLower(req.EntityType))

	response, err := re.ReactService.UpsertReaction(userID, req.EntityType, req.EntityId, req.Score)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	re.App.Logger.Info("reaction upserted successfully",
		"user_id", userID,
		"entity_type", req.EntityType,
		"entity_id", req.EntityId,
		"total_score", response.TotalScore,
	)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[reaction.ReactionResponse]{
		Success: true,
		Data:    response,
		Message: "Reaction updated successfully",
	})
}