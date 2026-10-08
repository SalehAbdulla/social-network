package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"social-network/backend/pkg/payload"
)

const readinessTimeout = 2 * time.Second

func (re *HandlerContext) Health(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (re *HandlerContext) Ready(w http.ResponseWriter, r *http.Request) {
	if err := re.pingDatabase(r.Context()); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(payload.ErrorResponse{
			Success: false,
			Error:   "database unreachable",
			Code:    http.StatusServiceUnavailable,
		})
		return
	}
	respond(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (re *HandlerContext) pingDatabase(parent context.Context) error {
	if re == nil || re.SocialService == nil || re.SocialService.Repo == nil || re.SocialService.Repo.Conn == nil {
		return errors.New("no database connection")
	}
	ctx, cancel := context.WithTimeout(parent, readinessTimeout)
	defer cancel()
	return re.SocialService.Repo.Conn.PingContext(ctx)
}
