package handlers

import (
	"math"
	"net/http"
	"strconv"
	"time"

	realtimeforum "social-network/backend"
	"social-network/backend/pkg/payload/user"
)

const (
	resetRequestsPerWindow = 3
	resetRequestWindow     = 15 * time.Minute
)

func (re *HandlerContext) RequestPasswordReset(w http.ResponseWriter, r *http.Request) {
	if !re.PasswordResetService.Available() {
		re.HandleError(w, r, realtimeforum.ErrResetUnavailable)
		return
	}

	var req user.PasswordResetRequestDTO
	if !re.decode(w, r, &req) {
		return
	}
	if err := req.Validate(); err != nil {
		re.HandleError(w, r, err)
		return
	}

	if re.ResetLimiter != nil {
		if wait := re.ResetLimiter.RetryAfter(req.Email); wait > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
			re.HandleError(w, r, realtimeforum.ErrTooManyRequests)
			return
		}
		re.ResetLimiter.Fail(req.Email)
	}

	if userID, err := re.AuthService.UserIDByEmail(req.Email); err == nil {
		if sendErr := re.PasswordResetService.RequestReset(userID, req.Email); sendErr != nil {
			re.App.Logger.Error("could not send the password reset mail",
				"error", sendErr, "delivery", re.PasswordResetService.Describe())
		}
	}

	respond(w, http.StatusAccepted, map[string]string{
		"message": "If that address has an account, a reset link is on its way.",
	})
}

func (re *HandlerContext) ConfirmPasswordReset(w http.ResponseWriter, r *http.Request) {
	if !re.PasswordResetService.Available() {
		re.HandleError(w, r, realtimeforum.ErrResetUnavailable)
		return
	}

	var req user.PasswordResetConfirmDTO
	if !re.decode(w, r, &req) {
		return
	}
	if err := req.Validate(); err != nil {
		re.HandleError(w, r, err)
		return
	}

	if err := re.PasswordResetService.ConfirmReset(req.Token, req.Password); err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, map[string]string{"message": "Password changed. Sign in with the new one."})
}
