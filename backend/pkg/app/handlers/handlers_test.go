package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	backend "social-network/backend"
	"social-network/backend/pkg/config"
)

// testContext builds the smallest handler context the error path needs: a
// discarded logger and a configured frontend origin. The services are left nil
// because nothing here reaches them.
func testContext(t *testing.T, frontendOrigin string) *HandlerContext {
	t.Helper()
	return NewHandlerContext(&config.AppConfig{
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		FrontendOrigin: frontendOrigin,
	}, nil, nil, nil, nil, nil, nil)
}

// TestHandleErrorStatusContract pins the status every sentinel answers with. The
// upload ceilings are the easiest entry to regress, because a request past a
// size limit is well formed and must not be reported as a bad request, and the
// generic 500 must never carry the underlying error text to the client.
func TestHandleErrorStatusContract(t *testing.T) {
	re := testContext(t, "http://localhost:4000")
	for _, testCase := range []struct {
		name   string
		err    error
		status int
		body   string
	}{
		{"bad request", backend.ErrBadRequest, http.StatusBadRequest, "bad request"},
		{"unauthorized", backend.ErrUnauthorized, http.StatusUnauthorized, "you must log in to do that"},
		{"forbidden", backend.ErrForbidden, http.StatusForbidden, "you don't have permission to do that"},
		{"not found", backend.ErrNotFound, http.StatusNotFound, "not found"},
		{"method not allowed", backend.ErrMethodNotAllowed, http.StatusMethodNotAllowed, "method not allowed"},
		{"rate limited", backend.ErrTooManyRequests, http.StatusTooManyRequests, "too many attempts, please wait a moment"},
		{"file too large", backend.ErrUploadTooLarge, http.StatusRequestEntityTooLarge, "the file is larger than the 50 MB limit"},
		{"image too large", backend.ErrImageTooLarge, http.StatusRequestEntityTooLarge, "the image is larger than the 10 MB limit"},
		{"empty upload", backend.ErrEmptyUpload, http.StatusBadRequest, "the selected file is empty"},
		{"nickname taken", backend.ErrNickName, http.StatusBadRequest, "this username is already taken"},
		{"comment too long", backend.ErrCommentLength, http.StatusBadRequest, "comment must be between 3 and 300 characters"},
		{"internal", backend.ErrInternal, http.StatusInternalServerError, "internal server error"},
		{"unknown", errors.New("connection reset by peer"), http.StatusInternalServerError, "internal server error"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest("POST", "/api/v1/posts", nil)
			re.HandleError(recorder, request, testCase.err)
			if recorder.Code != testCase.status {
				t.Fatalf("expected %d, got %d", testCase.status, recorder.Code)
			}
			var body struct {
				Success bool   `json:"success"`
				Error   string `json:"error"`
				Code    int    `json:"code"`
			}
			if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
				t.Fatalf("response is not JSON: %s", recorder.Body.String())
			}
			if body.Success || body.Code != testCase.status || body.Error != testCase.body {
				t.Fatalf("unexpected envelope: %+v", body)
			}
			if recorder.Header().Get("Content-Type") != "application/json" {
				t.Fatalf("error responses must stay JSON, got %q", recorder.Header().Get("Content-Type"))
			}
		})
	}
}

// TestAllowedOriginGatesTheWebSocketHandshake pins the rule the socket cannot
// fall back on CORS for: a browser always sends Origin on a handshake, so a
// request without one is not a browser and is refused, while a forged one has to
// match the host or the configured frontend origin.
func TestAllowedOriginGatesTheWebSocketHandshake(t *testing.T) {
	re := testContext(t, "https://social.example")
	for _, testCase := range []struct {
		name   string
		origin string
		host   string
		want   bool
	}{
		{"missing header", "", "social.example", false},
		{"same host", "https://social.example", "social.example", true},
		{"configured frontend origin", "https://social.example", "backend.internal", true},
		{"other origin", "https://evil.example", "social.example", false},
		{"same host over plain http", "http://social.example", "social.example", true},
		{"not a url", "not-a-url", "social.example", false},
		{"unsupported scheme", "ftp://social.example", "social.example", false},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest("GET", "/ws", nil)
			request.Host = testCase.host
			if testCase.origin != "" {
				request.Header.Set("Origin", testCase.origin)
			}
			if got := re.allowedOrigin(request); got != testCase.want {
				t.Fatalf("Origin %q against host %q: expected %v, got %v", testCase.origin, testCase.host, testCase.want, got)
			}
		})
	}
}

// TestIsASCII covers the gate the post fields use: control characters are
// rejected along with anything outside printable ASCII. Comments deliberately do
// not use it, because the spec allows an emoji there.
func TestIsASCII(t *testing.T) {
	for value, want := range map[string]bool{
		"":                 true,
		"Hello, world! 42": true,
		"café":             false,
		"emoji 😀":          false,
		"two\nlines":       false,
		"tab\tseparated":   false,
		"\x00null":         false,
	} {
		if got := isASCII(value); got != want {
			t.Fatalf("isASCII(%q) = %v, want %v", value, got, want)
		}
	}
}
