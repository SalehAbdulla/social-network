package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"real-time-forum/pkg/config"
	"real-time-forum/pkg/models"
	"real-time-forum/pkg/payload"
	"real-time-forum/pkg/render"
	"real-time-forum/pkg/app/service"
	pkgwebsocket "real-time-forum/pkg/websocket"
)

var HandlerCtx *HandlerContext

type HandlerContext struct {
	App                *config.AppConfig
	AuthService        service.AuthService
	CategoryService    service.CategoryService
	PostService        service.PostService
	CommentService     service.CommentService
	ReactService       service.ReactionService
	MessageService     service.MessageService
	NotificationService service.NotificationService
	Hub                *pkgwebsocket.Hub
}

func NewHandlerContext(a *config.AppConfig,
	as service.AuthService,
	cs service.CategoryService,
	ps service.PostService,
	cms service.CommentService,
	rs service.ReactionService,
	ms service.MessageService,
	ns service.NotificationService) *HandlerContext {
	return &HandlerContext{
		App:                 a,
		AuthService:         as,
		CategoryService:     cs,
		PostService:         ps,
		CommentService:      cms,
		ReactService:        rs,
		MessageService:      ms,
		NotificationService: ns,
	}
}

func SetHandlerContext(hc *HandlerContext) {
	HandlerCtx = hc
}

// Home serves the SPA entry point. All non-API, non-WebSocket GET requests
// return 200 + index.html. The client-side router determines what content
// to render (including a 404 page for unknown client routes).
func (m *HandlerContext) Home(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/ws") {
		m.NotFound(w, r)
		return
	}

	if err := render.RenderTemplate(w, &models.TemplateData{}); err != nil {
		m.App.Logger.Error("failed to render home template", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
	}
}

// NotFound handles requests to unknown endpoints.
// API/WebSocket paths get a JSON 404 response.
// Other paths get index.html with HTTP 404 status so the SPA can render its own 404 page.
func (m *HandlerContext) NotFound(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/ws") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(payload.ErrorResponse{
			Success: false,
			Error:   "endpoint not found",
			Code:    http.StatusNotFound,
		})
		return
	}

	w.WriteHeader(http.StatusNotFound)
	if err := render.RenderTemplate(w, &models.TemplateData{}); err != nil {
		m.App.Logger.Error("failed to render home template", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
	}
}