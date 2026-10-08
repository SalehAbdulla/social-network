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

const (
	loginMaxFailures   = 10
	loginFailureWindow = 15 * time.Minute
)

var HandlerCtx *HandlerContext

type HandlerContext struct {
	App                  *config.AppConfig
	SocialService        *service.SocialService
	AuthService          service.AuthService
	PostService          service.PostService
	CommentService       service.CommentService
	ReactService         service.ReactionService
	MessageService       service.MessageService
	NotificationService  service.NotificationService
	GroupService         *service.GroupService
	Hub                  *pkgwebsocket.Hub
	LoginLimiter         *middleware.AttemptLimiter
	ResetLimiter         *middleware.AttemptLimiter
	PasswordResetService *service.PasswordResetService
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
		ResetLimiter:        middleware.NewAttemptLimiter(resetRequestsPerWindow, resetRequestWindow),
	}
}

func SetHandlerContext(hc *HandlerContext) {
	HandlerCtx = hc
}

func (m *HandlerContext) NotFound(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotFound)
	json.NewEncoder(w).Encode(payload.ErrorResponse{
		Success: false,
		Error:   "endpoint not found",
		Code:    http.StatusNotFound,
	})
}
