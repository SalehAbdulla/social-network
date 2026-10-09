package tests

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"social-network/backend/pkg/web"
)

func TestSecurityHeadersOnAPIResponses(t *testing.T) {
	handler := web.Security(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest("GET", "http://localhost/api/v1/posts", nil))

	for header, want := range map[string]string{
		"X-Content-Type-Options":  "nosniff",
		"Referrer-Policy":         "same-origin",
		"X-Frame-Options":         "DENY",
		"Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
		"Cache-Control":           "no-store",
	} {
		if got := response.Header().Get(header); got != want {
			t.Fatalf("%s = %q, want %q", header, got, want)
		}
	}
}

func TestSecurityOriginAndRateLimits(t *testing.T) {
	handler := web.Security(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	bad := httptest.NewRequest("POST", "http://localhost/api/v1/posts", nil)
	bad.Header.Set("Origin", "https://evil.example")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, bad)
	if response.Code != 403 {
		t.Fatalf("cross-origin write accepted: %d", response.Code)
	}
	for i := 0; i < 21; i++ {
		r := httptest.NewRequest("POST", "http://localhost/api/v1/auth/login", nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		expected := 204
		if i == 20 {
			expected = 429
		}
		if w.Code != expected {
			t.Fatalf("request %d: got %d", i, w.Code)
		}
	}
}
