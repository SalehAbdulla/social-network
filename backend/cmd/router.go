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

	// Password reset is unauthenticated by definition — it is what someone uses
	// when they cannot sign in. The per-address rate limit lives in the handler,
	// next to the answer it protects, and the endpoint reports 503 when this
	// deployment has no way to deliver a link.
	mux.HandleFunc("POST /api/v1/auth/password-reset", handlers.HandlerCtx.RequestPasswordReset)
	mux.HandleFunc("POST /api/v1/auth/password-reset/confirm", handlers.HandlerCtx.ConfirmPasswordReset)

	// Probes are unauthenticated on purpose: a container healthcheck has no
	// session cookie. They sit under /api/v1 so the same URL answers directly
	// and through the frontend proxy, which is the path a browser uses.
	mux.HandleFunc("GET /api/v1/health", handlers.HandlerCtx.Health)
	mux.HandleFunc("GET /api/v1/ready", handlers.HandlerCtx.Ready)

	mux.Handle("POST /api/v1/auth/logout", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.Logout)))
	mux.Handle("GET /api/v1/auth/me", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.Me)))

	mux.Handle("GET /api/v1/posts", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetPosts)))
	mux.Handle("GET /api/v1/post", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetPost)))
	mux.Handle("POST /api/v1/posts", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.CreatePost)))
	mux.Handle("PUT /api/v1/posts/{postId}", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.UpdatePost)))
	mux.Handle("DELETE /api/v1/posts", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.DeletePost)))
	mux.Handle("GET /api/v1/posts/{postId}/insights", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.PostInsights)))
	mux.Handle("GET /api/v1/posts/comments", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetComments)))
	mux.Handle("POST /api/v1/posts/comments", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.CreateComments)))
	mux.Handle("DELETE /api/v1/posts/comments", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.DeleteComment)))
	mux.Handle("POST /api/v1/reactions", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.React)))
	mux.Handle("GET /api/v1/messages/users", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetChatUsers)))
	mux.Handle("GET /api/v1/messages/media", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetConversationMedia)))
	mux.Handle("GET /api/v1/messages", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetChatMessages)))
	mux.HandleFunc("GET /ws", handlers.HandlerCtx.ServeWs)

	mux.Handle("GET /api/v1/notifications", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetNotifications)))
	mux.Handle("GET /api/v1/notifications/unread-count", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetUnreadCount)))
	mux.Handle("GET /api/v1/notifications/unread-counts", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetUnreadCounts)))
	mux.Handle("PATCH /api/v1/notifications/{notificationId}/read", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.MarkAsRead)))
	mux.Handle("PATCH /api/v1/notifications/read-all", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.MarkAllAsRead)))

	mux.Handle("GET /api/v1/groups", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.ListGroups)))
	mux.Handle("POST /api/v1/groups", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.CreateGroup)))
	mux.Handle("GET /api/v1/groups/{groupId}", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetGroup)))
	for _, method := range []string{"PUT", "DELETE"} {
		mux.Handle(method+" /api/v1/groups/{groupId}", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.ManageGroup)))
		mux.Handle(method+" /api/v1/groups/{groupId}/members/{userId}", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.ManageGroupMember)))
		mux.Handle(method+" /api/v1/groups/{groupId}/content/{kind}/{id}", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GroupContent)))
	}
	mux.Handle("POST /api/v1/groups/{groupId}/join", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.JoinGroup)))
	mux.Handle("POST /api/v1/groups/{groupId}/invite/{userId}", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.InviteToGroup)))
	mux.Handle("GET /api/v1/groups/{groupId}/members", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetGroupMembers)))
	mux.Handle("GET /api/v1/groups/{groupId}/requests", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetGroupRequests)))
	mux.Handle("PUT /api/v1/groups/{groupId}/requests/{requestId}", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.DecideGroupRequest)))
	mux.Handle("GET /api/v1/groups/invitations", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.GetGroupInvitations)))
	mux.Handle("PUT /api/v1/groups/{groupId}/invitations/{invitationId}", pkgmiddleware.AuthMiddleware(http.HandlerFunc(handlers.HandlerCtx.DecideGroupInvitation)))

	for pattern, handler := range map[string]http.HandlerFunc{
		"GET /api/v1/follow-requests":             handlers.HandlerCtx.FollowRequests,
		"PUT /api/v1/follow-requests/{userId}":    handlers.HandlerCtx.DecideFollowRequest,
		"DELETE /api/v1/follow-requests/{userId}": handlers.HandlerCtx.DecideFollowRequest,
		"GET /api/v1/users":                       handlers.HandlerCtx.Discover,
		"GET /api/v1/users/{userId}":              handlers.HandlerCtx.UserProfile,
		"PUT /api/v1/users/me":                    handlers.HandlerCtx.UpdateProfile,
		"PUT /api/v1/users/me/password":           handlers.HandlerCtx.ChangePassword,
		"GET /api/v1/users/{userId}/posts":        handlers.HandlerCtx.ProfilePosts,
		"GET /api/v1/users/{userId}/media":        handlers.HandlerCtx.ProfileMedia,
		"GET /api/v1/users/{userId}/follows":      handlers.HandlerCtx.FollowLists,
		"PUT /api/v1/users/{userId}/follow":       handlers.HandlerCtx.Follow,
		"DELETE /api/v1/users/{userId}/follow":    handlers.HandlerCtx.Follow,
		"GET /api/v1/stories":                     handlers.HandlerCtx.Stories,
		"GET /api/v1/stories/archive":             handlers.HandlerCtx.ArchivedStories,
		"POST /api/v1/stories":                    handlers.HandlerCtx.CreateStory,
		"POST /api/v1/stories/{id}/view":          handlers.HandlerCtx.MarkStoryViewed,
		"DELETE /api/v1/stories/{id}":             handlers.HandlerCtx.DeleteStory,
		"GET /api/v1/stories/{id}/viewers":        handlers.HandlerCtx.StoryViewers,
		"POST /api/v1/stories/{id}/reply":         handlers.HandlerCtx.ReplyToStory,
		"GET /api/v1/stories/{id}/replies":        handlers.HandlerCtx.StoryReplies,
		"POST /api/v1/media":                      handlers.HandlerCtx.UploadMedia,
		"GET /api/v1/media/{id}":                  handlers.HandlerCtx.GetMedia,
		"PUT /api/v1/posts/comments/{id}":         handlers.HandlerCtx.EditComment,
		"POST /api/v1/messages":                   handlers.HandlerCtx.SendChatMessage,
		"PUT /api/v1/messages/{id}":               handlers.HandlerCtx.EditChatMessage,
		"DELETE /api/v1/messages/{id}":            handlers.HandlerCtx.DeleteChatMessage,
		"POST /api/v1/messages/read":              handlers.HandlerCtx.ReadChat,
		"GET /api/v1/saved-posts":                 handlers.HandlerCtx.SavedPosts,
		"GET /api/v1/posts/search":                handlers.HandlerCtx.SearchPosts,
		"GET /api/v1/hashtags/{tag}":              handlers.HandlerCtx.HashtagPosts,
		// A handle resolves to a profile, but the route cannot live under `/users/`: a
		// literal segment there beside `{userId}` collides with `/users/{userId}/media`
		// and its siblings, which have the same shape, and Go's mux refuses that at
		// registration rather than at request time.
		"GET /api/v1/handles/{nickname}":     handlers.HandlerCtx.UserByNickname,
		"POST /api/v1/posts/{postId}/save":   handlers.HandlerCtx.SavePost,
		"DELETE /api/v1/posts/{postId}/save": handlers.HandlerCtx.UnsavePost,
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
