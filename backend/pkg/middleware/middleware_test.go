package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"social-network/backend/pkg/app/service"
)

func TestAuthMiddleware(t *testing.T) {
	const userID = "middleware-user-id"
	if err := service.DefaultSessionManager.CreateSession(userID, "known-token"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { service.DefaultSessionManager.DeleteSession("known-token") })

	for _, testCase := range []struct {
		name       string
		cookie     string
		wantStatus int
		wantUser   string
	}{
		{"no cookie", "", http.StatusUnauthorized, ""},
		{"empty cookie", "session_token=", http.StatusUnauthorized, ""},
		{"unknown token", "session_token=not-a-token", http.StatusUnauthorized, ""},
		{"known token", "session_token=known-token", http.StatusOK, userID},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var seen string
			next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				seen, _ = UserIDFromContext(r.Context())
				w.WriteHeader(http.StatusOK)
			})
			request := httptest.NewRequest("GET", "/api/v1/users/me", nil)
			if testCase.cookie != "" {
				request.Header.Set("Cookie", testCase.cookie)
			}
			recorder := httptest.NewRecorder()
			AuthMiddleware(next).ServeHTTP(recorder, request)

			if recorder.Code != testCase.wantStatus {
				t.Fatalf("expected %d, got %d", testCase.wantStatus, recorder.Code)
			}
			if seen != testCase.wantUser {
				t.Fatalf("expected the context to carry %q, got %q", testCase.wantUser, seen)
			}
			cleared := recorder.Header().Get("Set-Cookie")
			if testCase.wantStatus == http.StatusUnauthorized {
				if !strings.Contains(cleared, "session_token=;") || !strings.Contains(cleared, "Max-Age=0") {
					t.Fatalf("expected the session cookie to be cleared, got %q", cleared)
				}
			} else if cleared != "" {
				t.Fatalf("a successful request must not rewrite the cookie, got %q", cleared)
			}
		})
	}
}

func TestUserIDFromContext(t *testing.T) {
	if id, ok := UserIDFromContext(context.Background()); ok || id != "" {
		t.Fatalf("a bare context reported a user: %q, %v", id, ok)
	}
	if id, ok := UserIDFromContext(context.WithValue(context.Background(), userIDKey, "someone")); !ok || id != "someone" {
		t.Fatalf("stored user was not returned: %q, %v", id, ok)
	}
}
