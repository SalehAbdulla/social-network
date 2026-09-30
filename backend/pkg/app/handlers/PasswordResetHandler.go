package handlers

import (
	"math"
	"net/http"
	"strconv"
	"time"

	realtimeforum "social-network/backend"
	"social-network/backend/pkg/payload/user"
)

// Reset requests are counted per address rather than per peer, for the reason the
// limiter itself gives: behind the frontend proxy every request arrives from one
// address, so a peer bucket cannot tell one member from a thousand. Every request
// counts, including the ones that find no account — counting only the successful
// lookups would make the limit itself answer the question the endpoint refuses to
// answer.
const (
	resetRequestsPerWindow = 3
	resetRequestWindow     = 15 * time.Minute
)

// RequestPasswordReset starts a reset and answers the same way whether or not the
// address belongs to an account. It answers 503 when this server has no way to
// deliver a link, because "check your email" would then be a lie the visitor
// cannot act on.
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

	// A lookup failure is deliberately not reported: an unknown address is
	// answered exactly like a known one, which is what keeps this endpoint from
	// being a registration oracle.
	if userID, err := re.AuthService.UserIDByEmail(req.Email); err == nil {
		if sendErr := re.PasswordResetService.RequestReset(userID, req.Email); sendErr != nil {
			// Logged, not surfaced: reporting that delivery failed for this
			// address and not for another is the oracle again, one layer down.
			re.App.Logger.Error("could not send the password reset mail",
				"error", sendErr, "delivery", re.PasswordResetService.Describe())
		}
	}

	// 202, and one sentence either way. Timing is the one channel this leaves
	// open — a known address writes a row and talks to a mail server, an unknown
	// one does neither — and it is recorded in DEPLOYMENT.md rather than papered
	// over with sleeps.
	respond(w, http.StatusAccepted, map[string]string{
		"message": "If that address has an account, a reset link is on its way.",
	})
}

// ConfirmPasswordReset redeems a link: it stores the new password and drops every
// session the account had. It does not sign the visitor in, because a reset is
// the "I lost control of this account" path and a new session handed to whoever
// holds the mail is the one thing it must not create.
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
