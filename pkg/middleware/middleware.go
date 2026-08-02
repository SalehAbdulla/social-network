package middleware

import (
	"context"
	"net/http"
	"real-time-forum/pkg/app/service"
)

type contextKey string

const userIDKey contextKey = "user_id"

func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, err := r.Cookie("session_token")
		if err != nil || token.Value == "" {
			clearSessionCookie(w)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		userID, ok := service.DefaultSessionManager.GetUserIdByToken(token.Value)
		if !ok {
			clearSessionCookie(w)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		service.DefaultSessionManager.UpdatePresence(userID)
		ctx := context.WithValue(r.Context(), userIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func UserIDFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(userIDKey).(string)
	return userID, ok
}

func clearSessionCookie(w http.ResponseWriter) {
	cookie := &http.Cookie{
		Name:     "session_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
	}
	http.SetCookie(w, cookie)
}
