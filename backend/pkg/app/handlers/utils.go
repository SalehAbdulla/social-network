package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	realtimeforum "real-time-forum"
	"real-time-forum/pkg/payload"
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

	switch err {
	case realtimeforum.ErrBadRequest:
		statusCode = http.StatusBadRequest
		level = slog.LevelWarn
	case realtimeforum.ErrUnauthorized:
		statusCode = http.StatusUnauthorized
		level = slog.LevelWarn
	case realtimeforum.ErrForbidden:
		statusCode = http.StatusForbidden
		level = slog.LevelWarn
	case realtimeforum.ErrNotFound:
		statusCode = http.StatusNotFound
		level = slog.LevelWarn
	case realtimeforum.ErrMethodNotAllowed:
		statusCode = http.StatusMethodNotAllowed
		level = slog.LevelWarn
	case realtimeforum.ErrInternal:
		statusCode = http.StatusInternalServerError
		level = slog.LevelError
	default:
		
		switch {
		case err == realtimeforum.ErrInvalidEmail,
			err == realtimeforum.ErrEmailExists,
			err == realtimeforum.ErrNickName,
			err == realtimeforum.ErrNickNameLength,
			err == realtimeforum.ErrPasswordLength,
			err == realtimeforum.ErrPasswordsDontMatch,
			err == realtimeforum.ErrInvalidPassForm,
			err == realtimeforum.ErrInvalidAge,
			err == realtimeforum.ErrGender,
			err == realtimeforum.ErrInvalidCredentials,
			err == realtimeforum.ErrTitleLength,
			err == realtimeforum.ErrContentLength,
			err == realtimeforum.ErrCommentLength,
			err == realtimeforum.ErrNoCategorySelected,
			err == realtimeforum.ErrMissingPostId,
			err == realtimeforum.ErrNonASCII,
			err == realtimeforum.ErrBadRequest:
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

	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(payload.ErrorResponse{
		Success: false,
		Error:   err.Error(),
		Code:    statusCode,
	})
}