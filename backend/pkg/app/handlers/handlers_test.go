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

// TestWrappedSentinelKeepsItsStatus is the reason the mapping uses errors.Is. The
// image ceiling wraps its sentinel so the message can name the file's measured size;
// a wrapped error that fell through to the default branch would answer 500 for a
// request that is merely too big, which is a worse bug than the wording it was
// meant to improve. The detail is what the client sees, and the generic 500 must
// still hide a real failure's text even when it is wrapped.
func TestWrappedSentinelKeepsItsStatus(t *testing.T) {
	re := testContext(t, "http://localhost:4000")
	for _, testCase := range []struct {
		name     string
		sentinel error
		err      error
		status   int
		body     string
	}{
		{
			"measured image size",
			backend.ErrImageTooLarge,
			backend.WithDetail(backend.ErrImageTooLarge, "Image is 12.4 MB; the limit is 10 MB."),
			http.StatusRequestEntityTooLarge,
			"Image is 12.4 MB; the limit is 10 MB.",
		},
		{
			"wrapped bad request",
			backend.ErrBadRequest,
			backend.WithDetail(backend.ErrBadRequest, "that follower is not one of yours"),
			http.StatusBadRequest,
			"that follower is not one of yours",
		},
		{
			"wrapped internal error",
			backend.ErrInternal,
			backend.WithDetail(backend.ErrInternal, "pq: relation \"post\" does not exist"),
			http.StatusInternalServerError,
			"internal server error",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			// The status mapping depends on the sentinel remaining reachable, so that
			// is asserted directly rather than only through the answer below.
			if !errors.Is(testCase.err, testCase.sentinel) {
				t.Fatalf("the detail hid its sentinel from errors.Is")
			}
			recorder := httptest.NewRecorder()
			re.HandleError(recorder, httptest.NewRequest("POST", "/api/v1/media", nil), testCase.err)
			if recorder.Code != testCase.status {
				t.Fatalf("expected %d for a wrapped sentinel, got %d", testCase.status, recorder.Code)
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
		})
	}
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
		{"wrong current password", backend.ErrWrongPassword, http.StatusBadRequest, "your current password is incorrect"},
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

// decodeEnvelope reads the {success, data, error, code} shape the probes answer
// with, so a test can assert the envelope rather than a substring.
func decodeEnvelope(t *testing.T, recorder *httptest.ResponseRecorder) (success bool, data map[string]string, message string, code int) {
	t.Helper()
	var body struct {
		Success bool              `json:"success"`
		Data    map[string]string `json:"data"`
		Error   string            `json:"error"`
		Code    int               `json:"code"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("probe response is not JSON: %s", recorder.Body.String())
	}
	if recorder.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("a probe must answer JSON, got %q", recorder.Header().Get("Content-Type"))
	}
	return body.Success, body.Data, body.Error, body.Code
}

// TestHealthIsLivenessWithoutTheDatabase pins the split between the two probes:
// liveness answers 200 even when there is no database behind it, because its
// only claim is that the process is serving.
func TestHealthIsLivenessWithoutTheDatabase(t *testing.T) {
	re := testContext(t, "http://localhost:4000")
	recorder := httptest.NewRecorder()
	re.Health(recorder, httptest.NewRequest("GET", "/api/v1/health", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	success, data, _, _ := decodeEnvelope(t, recorder)
	if !success || data["status"] != "ok" {
		t.Fatalf("unexpected liveness body: %+v", data)
	}
}

// TestReadyFailsClosedWithoutADatabase covers the deliberate edge in the
// readiness probe: a context whose services were never wired, and even a nil
// context, must answer 503 rather than panic, because a panicking healthcheck
// is a crash loop instead of a diagnosis.
func TestReadyFailsClosedWithoutADatabase(t *testing.T) {
	for name, re := range map[string]*HandlerContext{
		"services not wired": testContext(t, "http://localhost:4000"),
		"nil context":        nil,
	} {
		t.Run(name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			re.Ready(recorder, httptest.NewRequest("GET", "/api/v1/ready", nil))
			if recorder.Code != http.StatusServiceUnavailable {
				t.Fatalf("expected 503, got %d", recorder.Code)
			}
			success, _, message, code := decodeEnvelope(t, recorder)
			if success || code != http.StatusServiceUnavailable || message != "database unreachable" {
				t.Fatalf("a failed probe must not answer a success envelope: %d %s %s", recorder.Code, message, recorder.Body.String())
			}
		})
	}
}
