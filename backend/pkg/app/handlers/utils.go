package handlers

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	realtimeforum "social-network/backend"
	"social-network/backend/pkg/payload"
	"strings"
)

func (re *HandlerContext) parseForm(w http.ResponseWriter, r *http.Request) bool {

	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			re.HandleError(w, r, realtimeforum.ErrBadRequest)
			return false
		}
	} else if err := r.ParseForm(); err != nil {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return false
	}
	return true
}

func isASCII(s string) bool {
	for _, r := range s {
		if r < 0x20 || r > 0x7E {
			return false
		}
	}
	return true
}

func (re *HandlerContext) HandleError(w http.ResponseWriter, r *http.Request, err error) {

	var statusCode int
	var level slog.Level

	switch {
	case errors.Is(err, realtimeforum.ErrAlreadyFollowing),
		errors.Is(err, realtimeforum.ErrFollowPending),
		errors.Is(err, realtimeforum.ErrReverseFollowPending):
		statusCode = http.StatusConflict
		level = slog.LevelWarn
	case errors.Is(err, realtimeforum.ErrBadRequest):
		statusCode = http.StatusBadRequest
		level = slog.LevelWarn
	case errors.Is(err, realtimeforum.ErrUnauthorized):
		statusCode = http.StatusUnauthorized
		level = slog.LevelWarn
	case errors.Is(err, realtimeforum.ErrForbidden):
		statusCode = http.StatusForbidden
		level = slog.LevelWarn
	case errors.Is(err, realtimeforum.ErrNotFound):
		statusCode = http.StatusNotFound
		level = slog.LevelWarn
	case errors.Is(err, realtimeforum.ErrMethodNotAllowed):
		statusCode = http.StatusMethodNotAllowed
		level = slog.LevelWarn
	case errors.Is(err, realtimeforum.ErrTooManyRequests):
		statusCode = http.StatusTooManyRequests
		level = slog.LevelWarn
	case errors.Is(err, realtimeforum.ErrUploadTooLarge), errors.Is(err, realtimeforum.ErrImageTooLarge):
		statusCode = http.StatusRequestEntityTooLarge
		level = slog.LevelWarn
	case errors.Is(err, realtimeforum.ErrEmptyUpload):
		statusCode = http.StatusBadRequest
		level = slog.LevelWarn
	case errors.Is(err, realtimeforum.ErrResetUnavailable):
		statusCode = http.StatusServiceUnavailable
		level = slog.LevelWarn
	case errors.Is(err, realtimeforum.ErrInternal):
		statusCode = http.StatusInternalServerError
		level = slog.LevelError
	default:

		switch {
		case errors.Is(err, realtimeforum.ErrInvalidEmail),
			errors.Is(err, realtimeforum.ErrEmailExists),
			errors.Is(err, realtimeforum.ErrNickName),
			errors.Is(err, realtimeforum.ErrNickNameLength),
			errors.Is(err, realtimeforum.ErrPasswordLength),
			errors.Is(err, realtimeforum.ErrPasswordsDontMatch),
			errors.Is(err, realtimeforum.ErrInvalidPassForm),
			errors.Is(err, realtimeforum.ErrInvalidAge),
			errors.Is(err, realtimeforum.ErrInvalidBirthDate),
			errors.Is(err, realtimeforum.ErrGender),
			errors.Is(err, realtimeforum.ErrInvalidCredentials),
			errors.Is(err, realtimeforum.ErrWrongPassword),
			errors.Is(err, realtimeforum.ErrTitleLength),
			errors.Is(err, realtimeforum.ErrContentLength),
			errors.Is(err, realtimeforum.ErrCommentLength),
			errors.Is(err, realtimeforum.ErrMissingPostId),
			errors.Is(err, realtimeforum.ErrNonASCII),
			errors.Is(err, realtimeforum.ErrInvalidResetToken),
			errors.Is(err, realtimeforum.ErrBadRequest):
			statusCode = http.StatusBadRequest
			level = slog.LevelWarn
		default:
			statusCode = http.StatusInternalServerError
			level = slog.LevelError
		}
	}

	re.App.Logger.LogAttrs(r.Context(), level, "request error",
		slog.String("error", err.Error()),
		slog.String("method", r.Method),
		slog.String("path", r.URL.Path),
		slog.String("remote", r.RemoteAddr),
		slog.Int("status", statusCode),
	)

	message := err.Error()
	if statusCode == http.StatusInternalServerError {
		message = "internal server error"
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(payload.ErrorResponse{
		Success: false,
		Error:   message,
		Code:    statusCode,
	})
}
