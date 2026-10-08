package handlers

import (
	"net/http"
	"strings"

	realtimeforum "social-network/backend"
	"social-network/backend/pkg/app/service"
	"social-network/backend/pkg/middleware"
	"social-network/backend/pkg/models"
)

const (
	savedAccountsCookieName = "saved_accounts"
	savedAccountsMaxAge     = 60 * 60 * 24 * 30
	maxSavedAccounts        = 5
)

type accountsResponse struct {
	Accounts     []models.SavedAccount `json:"accounts"`
	ActiveUserID string                `json:"activeUserId"`
}

type accountAction struct {
	UserID string `json:"userId"`
}

func savedAccountTokens(r *http.Request) []string {
	cookie, err := r.Cookie(savedAccountsCookieName)
	if err != nil || cookie.Value == "" {
		return nil
	}
	parts := strings.Split(cookie.Value, ",")
	tokens := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			tokens = append(tokens, part)
		}
	}
	return tokens
}

func rememberAccountToken(tokens []string, token string) []string {
	if token == "" {
		return tokens
	}
	next := make([]string, 0, len(tokens)+1)
	next = append(next, token)
	for _, existing := range tokens {
		if existing == token || len(next) >= maxSavedAccounts {
			continue
		}
		next = append(next, existing)
	}
	return next
}

func activeTokens(r *http.Request) []string {
	tokens := savedAccountTokens(r)
	if cookie, err := r.Cookie("session_token"); err == nil && cookie.Value != "" {
		tokens = rememberAccountToken(tokens, cookie.Value)
	}
	return tokens
}

func (re *HandlerContext) setSavedAccounts(w http.ResponseWriter, tokens []string) {
	cookie := &http.Cookie{
		Name:     savedAccountsCookieName,
		Path:     "/",
		HttpOnly: true,
		Secure:   re.App.InProduction,
		SameSite: http.SameSiteLaxMode,
	}
	if len(tokens) == 0 {
		cookie.MaxAge = -1
	} else {
		cookie.Value = strings.Join(tokens, ",")
		cookie.MaxAge = savedAccountsMaxAge
	}
	http.SetCookie(w, cookie)
}

func (re *HandlerContext) setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   re.App.InProduction,
		SameSite: http.SameSiteLaxMode,
	})
}

func (re *HandlerContext) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   re.App.InProduction,
		SameSite: http.SameSiteLaxMode,
	})
}

func accountViews(sessions []service.SavedAccountSession) []models.SavedAccount {
	accounts := make([]models.SavedAccount, 0, len(sessions))
	for _, session := range sessions {
		accounts = append(accounts, session.SavedAccount)
	}
	return accounts
}

func (re *HandlerContext) Accounts(w http.ResponseWriter, r *http.Request) {
	activeUserID, _ := middleware.UserIDFromContext(r.Context())

	sessions, err := re.AuthService.SavedAccounts(activeTokens(r))
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	tokens := make([]string, 0, len(sessions))
	for _, session := range sessions {
		tokens = append(tokens, session.Token)
	}
	re.setSavedAccounts(w, tokens)

	respond(w, http.StatusOK, accountsResponse{Accounts: accountViews(sessions), ActiveUserID: activeUserID})
}

func (re *HandlerContext) SwitchAccount(w http.ResponseWriter, r *http.Request) {
	var req accountAction
	if !re.decode(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.UserID) == "" {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	tokens := activeTokens(r)
	token, ok := re.AuthService.TokenForUser(tokens, req.UserID)
	if !ok {
		re.HandleError(w, r, realtimeforum.ErrNotFound)
		return
	}

	re.setSessionCookie(w, token)
	re.setSavedAccounts(w, rememberAccountToken(tokens, token))

	re.App.Logger.Info("account switched", "user_id", req.UserID)
	respond(w, http.StatusOK, accountAction{UserID: req.UserID})
}

func (re *HandlerContext) RemoveSavedAccount(w http.ResponseWriter, r *http.Request) {
	activeUserID, _ := middleware.UserIDFromContext(r.Context())

	var req accountAction
	if !re.decode(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.UserID) == "" {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	sessions, err := re.AuthService.SavedAccounts(activeTokens(r))
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	remaining := make([]service.SavedAccountSession, 0, len(sessions))
	tokens := make([]string, 0, len(sessions))
	removingActive := false
	for _, session := range sessions {
		if session.UserID == req.UserID {
			removingActive = removingActive || session.UserID == activeUserID
			_ = re.AuthService.Logout(session.Token)
			continue
		}
		remaining = append(remaining, session)
		tokens = append(tokens, session.Token)
	}
	re.setSavedAccounts(w, tokens)

	nextActive := activeUserID
	if removingActive {
		if len(remaining) > 0 {
			re.setSessionCookie(w, remaining[0].Token)
			nextActive = remaining[0].UserID
		} else {
			re.clearSessionCookie(w)
			nextActive = ""
		}
	}

	re.App.Logger.Info("saved account removed", "user_id", req.UserID, "active_user_id", nextActive)
	respond(w, http.StatusOK, accountsResponse{Accounts: accountViews(remaining), ActiveUserID: nextActive})
}
