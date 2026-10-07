package handlers

import (
	"net/http"
	"strings"

	realtimeforum "social-network/backend"
	"social-network/backend/pkg/app/service"
	"social-network/backend/pkg/middleware"
	"social-network/backend/pkg/models"
)

// Multiple accounts on one browser.
//
// The active session lives in the HttpOnly `session_token` cookie, which the page
// can never read — that is what makes the token safe from script. A switcher that
// asked the page to hold tokens would undo exactly that, so the list of saved
// tokens lives in a second HttpOnly cookie the server owns and rewrites:
// `saved_accounts`, one token per account, comma-separated. A session token is a
// UUID, so a comma is never part of one.
//
// This buys passwordless switching without ever handing a token to JavaScript: the
// browser asks to switch by userId, and the server swaps which saved token the
// `session_token` cookie points at. Logging out clears both cookies and revokes
// every saved session, so nothing is left for a switch to pick up.
const (
	savedAccountsCookieName = "saved_accounts"
	// savedAccountsMaxAge matches the "remember me" session cookie: a saved list
	// is a convenience that should not outlive the credentials it stands for.
	savedAccountsMaxAge = 60 * 60 * 24 * 30
	// A browser remembers a handful of accounts, not an unbounded list: five is
	// what the switcher shows, and it keeps the cookie small.
	maxSavedAccounts = 5
)

// accountsResponse is the switcher's payload. The tokens that perform the switch
// are deliberately absent: the page is told who the accounts are and which is
// active, never how to become them.
type accountsResponse struct {
	Accounts     []models.SavedAccount `json:"accounts"`
	ActiveUserID string                `json:"activeUserId"`
}

// accountAction names the account a switch or a removal is about.
type accountAction struct {
	UserID string `json:"userId"`
}

// savedAccountTokens reads the cookie, ignoring blanks and surrounding space. A
// malformed value degrades to an empty list rather than an error: the worst case
// is a switcher that has to re-learn the accounts on the next sign-in.
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

// rememberAccountToken puts a token at the front of the list — the newest login is
// the one to show first — drops an exact duplicate, and trims the list so it cannot
// grow without bound. An account's previous token, if the same account was signed
// into twice, is left in place; SavedAccounts skips it once its session has been
// revoked, which also keeps this function free of database work on the login path.
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

// activeTokens is the saved list with the browser's current session token moved to
// the front. It means the active account is always in the list even when a session
// predates this feature — the switcher shows the account you are already signed in
// as rather than an empty list.
func activeTokens(r *http.Request) []string {
	tokens := savedAccountTokens(r)
	if cookie, err := r.Cookie("session_token"); err == nil && cookie.Value != "" {
		tokens = rememberAccountToken(tokens, cookie.Value)
	}
	return tokens
}

// setSavedAccounts writes the list back, or clears the cookie when it is empty.
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

// setSessionCookie points the active session at a token. Like the password-change
// rotation it is deliberately not persistent: a switch is a deliberate act in this
// browser, and a remembered grant is re-established by signing in.
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

// accountViews strips the tokens from resolved sessions, which is the only form a
// handler may answer with.
func accountViews(sessions []service.SavedAccountSession) []models.SavedAccount {
	accounts := make([]models.SavedAccount, 0, len(sessions))
	for _, session := range sessions {
		accounts = append(accounts, session.SavedAccount)
	}
	return accounts
}

// Accounts answers the switcher: every account this browser saved that still has a
// live session, plus which is active. A token revoked elsewhere — a password change
// in another browser, say — simply fails to resolve and disappears here, and the
// pruned list is written back so the dead token cannot occupy a slot.
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

// SwitchAccount makes one saved account the active session. The browser asks by
// userId and the server swaps the cookie, so the token that performs the switch is
// never sent to the page.
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
		// Not saved here, or its session expired. The switcher's next read of the
		// list will have dropped it.
		re.HandleError(w, r, realtimeforum.ErrNotFound)
		return
	}

	re.setSessionCookie(w, token)
	re.setSavedAccounts(w, rememberAccountToken(tokens, token))

	re.App.Logger.Info("account switched", "user_id", req.UserID)
	respond(w, http.StatusOK, accountAction{UserID: req.UserID})
}

// RemoveSavedAccount forgets one account in this browser and revokes its session,
// so the token does not linger in the cookie. When the removed account was the
// active one, the next saved account takes over — the response's activeUserId says
// which, or "" when nothing is left and the browser is signed out.
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
			// Forgetting an account signs that one out of this browser.
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
