package handlers

import (
	"encoding/json"
	"net/http"
	"social-network/backend/pkg/app/service"
	"social-network/backend/pkg/config"
	"social-network/backend/pkg/middleware"
	"social-network/backend/pkg/payload"
	pkgwebsocket "social-network/backend/pkg/websocket"
	"time"
)

// Login attempts are counted per account, not per peer: behind the frontend
// proxy every request arrives from the same address, so a peer-keyed bucket
// cannot tell one member from a thousand (see DEPLOYMENT.md).
const (
	loginMaxFailures   = 10
	loginFailureWindow = 15 * time.Minute
)

var HandlerCtx *HandlerContext

type HandlerContext struct {
	App                 *config.AppConfig
	SocialService       *service.SocialService
	AuthService         service.AuthService
	PostService         service.PostService
	CommentService      service.CommentService
	ReactService        service.ReactionService
	MessageService      service.MessageService
	NotificationService service.NotificationService
	GroupService        *service.GroupService
	Hub                 *pkgwebsocket.Hub
	// LoginLimiter locks an account after repeated failed sign-ins. Tests swap it
	// for a short window; a nil limiter simply disables the check.
	LoginLimiter *middleware.AttemptLimiter
}

func NewHandlerContext(a *config.AppConfig,
	as service.AuthService,
	ps service.PostService,
	cms service.CommentService,
	rs service.ReactionService,
	ms service.MessageService,
	ns service.NotificationService) *HandlerContext {
	return &HandlerContext{
		App:                 a,
		AuthService:         as,
		PostService:         ps,
		CommentService:      cms,
		ReactService:        rs,
		MessageService:      ms,
		NotificationService: ns,
		LoginLimiter:        middleware.NewAttemptLimiter(loginMaxFailures, loginFailureWindow),
	}
}

func SetHandlerContext(hc *HandlerContext) {
	HandlerCtx = hc
}

// NotFound handles requests to unknown API/WebSocket endpoints with a JSON 404 response.
func (m *HandlerContext) NotFound(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotFound)
	json.NewEncoder(w).Encode(payload.ErrorResponse{
		Success: false,
		Error:   "endpoint not found",
		Code:    http.StatusNotFound,
	})
}
