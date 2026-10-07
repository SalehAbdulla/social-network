package handlers

import (
	"encoding/json"
	"net/http"
	realtimeforum "social-network/backend"
	"social-network/backend/pkg/middleware"
	"social-network/backend/pkg/payload"
	"social-network/backend/pkg/payload/reaction"
	"strconv"
	"strings"
)

// idString accepts a JSON string or a JSON number and keeps it as text. A reaction target's id
// is not one type: a post is named by its public UUID (see migration 000020) while a comment, a
// message and a group row are still named by their own integer key, and the client should not
// have to know which -- so both spellings decode here.
type idString string

func (s *idString) UnmarshalJSON(data []byte) error {
	*s = idString(strings.Trim(strings.TrimSpace(string(data)), `"`))
	return nil
}

type ReactRequest struct {
	EntityType string   `json:"entityType"`
	EntityId   idString `json:"entityId"`
	Score      int      `json:"score"`
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
	rawID := strings.TrimSpace(string(req.EntityId))

	entityId, err := re.reactionEntityID(req.EntityType, rawID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	response, err := re.ReactService.UpsertReaction(userID, req.EntityType, entityId, req.Score)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	re.App.Logger.Info("reaction upserted successfully",
		"user_id", userID,
		"entity_type", req.EntityType,
		"entity_id", rawID,
		"total_score", response.TotalScore,
	)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[reaction.ReactionResponse]{
		Success: true,
		Data:    response,
		Message: "Reaction updated successfully",
	})
}

// reactionEntityID reads a reaction target's id the way its type stores it: a post's public
// UUID resolves to the post table's own key, and every other target is that row's integer id.
func (re *HandlerContext) reactionEntityID(entityType, raw string) (int, error) {
	if raw == "" {
		return 0, realtimeforum.ErrBadRequest
	}
	if entityType == "post" {
		return re.resolvePostID(raw)
	}
	id, err := strconv.Atoi(raw)
	if err != nil || id < 1 {
		return 0, realtimeforum.ErrBadRequest
	}
	return id, nil
}
