package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"social-network/backend/pkg/payload"
)

// readinessTimeout bounds how long a probe may wait on SQLite before it is
// reported unavailable. A healthcheck has to answer quickly with a verdict
// rather than hang behind a database that is locked or gone.
const readinessTimeout = 2 * time.Second

// Health is the liveness probe: the process is up and the HTTP server answers.
// It deliberately does not touch the database, so an orchestrator can tell a
// dead process apart from a live one that cannot serve requests. The probes
// need no session — no container can present a cookie — and they are covered by
// the general per-peer request limit like every other route.
func (re *HandlerContext) Health(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Ready is the readiness probe: the process can answer requests that need the
// database. This is what `compose.yaml` gates the frontend on, so the frontend
// no longer starts beside a backend that is still migrating.
func (re *HandlerContext) Ready(w http.ResponseWriter, r *http.Request) {
	if err := re.pingDatabase(r.Context()); err != nil {
		// A failed probe is not a success envelope with a 503 inside it.
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

// pingDatabase reaches the connection through the service the rest of this
// package already uses, so readiness needs no extra dependency on the handler
// context. Every missing step on that path — services never wired, a handler
// context built without a database — is reported as unreachable rather than
// panicking, because a panic in a probe is a crash loop, not a diagnosis.
func (re *HandlerContext) pingDatabase(parent context.Context) error {
	if re == nil || re.SocialService == nil || re.SocialService.Repo == nil || re.SocialService.Repo.Conn == nil {
		return errors.New("no database connection")
	}
	ctx, cancel := context.WithTimeout(parent, readinessTimeout)
	defer cancel()
	return re.SocialService.Repo.Conn.PingContext(ctx)
}
