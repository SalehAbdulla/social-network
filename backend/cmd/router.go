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
	mux.HandleFunc("GET /api/v1/auth/nickname-availability", handlers.HandlerCtx.NicknameAvailability)

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

	mux.Handle("GET /api/v1/groups", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.ListGroups)))
	mux.Handle("POST /api/v1/groups", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.CreateGroup)))
	mux.Handle("GET /api/v1/groups/{groupId}", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetGroup)))
	mux.Handle("POST /api/v1/groups/{groupId}/join", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.JoinGroup)))
	mux.Handle("POST /api/v1/groups/{groupId}/invite/{userId}", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.InviteToGroup)))
	mux.Handle("GET /api/v1/groups/{groupId}/members", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetGroupMembers)))
	mux.Handle("GET /api/v1/groups/{groupId}/requests", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetGroupRequests)))
	mux.Handle("PUT /api/v1/groups/{groupId}/requests/{requestId}", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.DecideGroupRequest)))
	mux.Handle("GET /api/v1/groups/invitations", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetGroupInvitations)))
	mux.Handle("PUT /api/v1/groups/{groupId}/invitations/{invitationId}", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.DecideGroupInvitation)))

	if handlers.HandlerCtx.App.DevDummyUser && !handlers.HandlerCtx.App.InProduction {
		mux.HandleFunc("POST /api/v1/dev/session", handlers.HandlerCtx.DevSession)
	}
	for pattern, handler := range map[string]http.HandlerFunc{
		"GET /api/v1/users":                    handlers.HandlerCtx.Discover,
		"GET /api/v1/users/{userId}":           handlers.HandlerCtx.UserProfile,
		"PUT /api/v1/users/me":                 handlers.HandlerCtx.UpdateProfile,
		"GET /api/v1/users/{userId}/posts":     handlers.HandlerCtx.ProfilePosts,
		"PUT /api/v1/users/{userId}/follow":    handlers.HandlerCtx.Follow,
		"DELETE /api/v1/users/{userId}/follow": handlers.HandlerCtx.Follow,
		"GET /api/v1/connections":              handlers.HandlerCtx.Connections,
		"POST /api/v1/connections/{userId}":    handlers.HandlerCtx.ChangeConnection,
		"PUT /api/v1/connections/{userId}":     handlers.HandlerCtx.ChangeConnection,
		"DELETE /api/v1/connections/{userId}":  handlers.HandlerCtx.ChangeConnection,
		"GET /api/v1/stories":                  handlers.HandlerCtx.Stories,
		"POST /api/v1/stories":                 handlers.HandlerCtx.CreateStory,
		"DELETE /api/v1/stories/{id}":          handlers.HandlerCtx.DeleteStory,
		"POST /api/v1/media":                   handlers.HandlerCtx.UploadMedia,
		"GET /api/v1/media/{id}":               handlers.HandlerCtx.GetMedia,
		"PUT /api/v1/posts/comments/{id}":      handlers.HandlerCtx.EditComment,
		"POST /api/v1/messages":                handlers.HandlerCtx.SendChatMessage,
		"PUT /api/v1/messages/{id}":            handlers.HandlerCtx.EditChatMessage,
		"DELETE /api/v1/messages/{id}":         handlers.HandlerCtx.DeleteChatMessage,
		"POST /api/v1/messages/read":           handlers.HandlerCtx.ReadChat,
	} {
		mux.Handle(pattern, pkgmiddleware.AuthMiddleware(handler))
	}

	// Catch-all — return JSON 404 for unknown endpoints
	for _, method := range []string{"GET", "POST"} {
		mux.Handle(method+" /api/v1/groups/{groupId}/content/{kind}", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GroupContent)))
	}
	mux.Handle("PUT /api/v1/groups/{groupId}/events/{eventId}/rsvp", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GroupRSVP)))
	mux.HandleFunc("/{path...}", handlers.HandlerCtx.NotFound)

	return RequestLogger(Security(mux))
}
