package main

import (
	"net/http"
	"social-network/backend/pkg/app/handlers"
	pkgmiddleware "social-network/backend/pkg/middleware"
)

func routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/v1/auth/register", handlers.HandlerCtx.Register)
	mux.HandleFunc("POST /api/v1/auth/login", handlers.HandlerCtx.Login)

	mux.Handle("POST /api/v1/auth/logout", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.Logout)))
	mux.Handle("GET /api/v1/auth/me", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.Me)))
	mux.Handle("GET /api/v1/posts", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetPosts)))
	mux.Handle("GET /api/v1/post", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetPost)))
	mux.Handle("POST /api/v1/posts", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.CreatePost)))
	mux.Handle("DELETE /api/v1/posts", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.DeletePost)))
	mux.Handle("GET /api/v1/posts/comments", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetComments)))
	mux.Handle("POST /api/v1/posts/comments", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.CreateComments)))
	mux.Handle("DELETE /api/v1/posts/comments", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.DeleteComment)))
	mux.Handle("POST /api/v1/reactions", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.React)))
	mux.Handle("GET /api/v1/messages/users", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetChatUsers)))
	mux.Handle("GET /api/v1/messages", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetChatMessages)))
	mux.HandleFunc("GET /ws", handlers.HandlerCtx.ServeWs)

	mux.Handle("GET /api/v1/notifications", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetNotifications)))
	mux.Handle("GET /api/v1/notifications/unread-count", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetUnreadCount)))
	mux.Handle("PATCH /api/v1/notifications/{notificationId}/read", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.MarkAsRead)))
	mux.Handle("PATCH /api/v1/notifications/read-all", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.MarkAllAsRead)))

	// Catch-all — return JSON 404 for unknown endpoints
	mux.HandleFunc("/{path...}", handlers.HandlerCtx.NotFound)

	return RequestLogger(mux)
}