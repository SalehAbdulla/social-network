package handlers

import (
	"encoding/json"
	"net/http"
	realtimeforum "social-network/backend"
	"social-network/backend/pkg/middleware"
	"social-network/backend/pkg/payload"
	"social-network/backend/pkg/payload/user"
	"strconv"
	"strings"
)

type registerResponse struct {
	UserID   string `json:"userId"`
	Nickname string `json:"nickname"`
}

type loginResponse struct {
	UserID   string `json:"userId"`
	Nickname string `json:"nickname"`
}

type logoutResponse struct {
	Message string `json:"message"`
}

func (re *HandlerContext) NicknameAvailability(w http.ResponseWriter, r *http.Request) {
	available, err := re.AuthService.NicknameAvailable(r.URL.Query().Get("nickname"))
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, map[string]bool{"available": available})
}

func (re *HandlerContext) Register(w http.ResponseWriter, r *http.Request) {
	var req user.RegisterRequestDTO

	if err := req.ParseAndValidate(r); err != nil {
		re.HandleError(w, r, err)
		return
	}

	registered, err := re.AuthService.Register(req)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    registered.Token,
		Path:     "/",
		HttpOnly: true,
		Secure:   re.App.InProduction,
		SameSite: http.SameSiteLaxMode,
	})

	re.setSavedAccounts(w, rememberAccountToken(savedAccountTokens(r), registered.Token))

	re.App.Logger.Info("user registered and logged in successfully",
		"user_id", registered.UserID,
		"email", req.Email,
		"nickname", registered.Nickname,
	)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(payload.SuccessResponse[registerResponse]{
		Success: true,
		Data: registerResponse{
			UserID:   registered.UserID,
			Nickname: registered.Nickname,
		},
		Message: "user registered successfully",
	})
}

func (re *HandlerContext) Login(w http.ResponseWriter, r *http.Request) {
	identifier := strings.TrimSpace(strings.ToLower(r.FormValue("identifier")))
	password := strings.TrimSpace(r.FormValue("password"))
	rememberMe := r.FormValue("rememberMe") == "true" || r.FormValue("rememberMe") == "on"

	if identifier == "" || password == "" {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	if re.LoginLimiter != nil {
		if wait := re.LoginLimiter.RetryAfter(identifier); wait > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
			re.HandleError(w, r, realtimeforum.ErrTooManyRequests)
			return
		}
	}

	userID, token, err := re.AuthService.Login(identifier, password)
	if err != nil {
		if re.LoginLimiter != nil {
			re.LoginLimiter.Fail(identifier)
		}
		re.HandleError(w, r, err)
		return
	}
	if re.LoginLimiter != nil {
		re.LoginLimiter.Reset(identifier)
	}

	cookie := &http.Cookie{
		Name:     "session_token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   re.App.InProduction,
		SameSite: http.SameSiteLaxMode,
	}

	if rememberMe {
		cookie.MaxAge = 60 * 60 * 24 * 30
	}

	http.SetCookie(w, cookie)

	re.setSavedAccounts(w, rememberAccountToken(savedAccountTokens(r), token))

	re.App.Logger.Info("login successful",
		"user_id", userID,
		"identifier", identifier,
	)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[loginResponse]{
		Success: true,
		Data: loginResponse{
			UserID: userID,
		},
		Message: "login successful",
	})
}

func (re *HandlerContext) Logout(w http.ResponseWriter, r *http.Request) {
	tokenCookie, err := r.Cookie("session_token")
	if err != nil || tokenCookie.Value == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	revoked := make(map[string]bool)
	for _, token := range append(savedAccountTokens(r), tokenCookie.Value) {
		if token == "" || revoked[token] {
			continue
		}
		if err := re.AuthService.Logout(token); err != nil {
			re.HandleError(w, r, err)
			return
		}
		revoked[token] = true
	}

	if userID, ok := middleware.UserIDFromContext(r.Context()); ok && userID != "" && re.Hub != nil {
		if client := re.Hub.GetClientByUserID(userID); client != nil {
			re.Hub.Unregister <- client
		}
	}

	re.clearSessionCookie(w)
	re.setSavedAccounts(w, nil)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[logoutResponse]{
		Success: true,
		Data: logoutResponse{
			Message: "Logged out",
		},
		Message: "Logged out successfully",
	})
}

func (re *HandlerContext) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	var req user.ChangePasswordRequestDTO
	if !re.decode(w, r, &req) {
		return
	}
	if err := req.Validate(); err != nil {
		re.HandleError(w, r, err)
		return
	}

	token, err := re.AuthService.ChangePassword(userID, req.CurrentPassword, req.NewPassword)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   re.App.InProduction,
		SameSite: http.SameSiteLaxMode,
	})

	re.App.Logger.Info("password changed", "user_id", userID)

	respond(w, http.StatusOK, map[string]string{"message": "Password changed"})
}

func (re *HandlerContext) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	profile, err := re.AuthService.GetMe(userID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[user.UserDTO]{
		Success: true,
		Data:    profile,
		Message: "User profile retrieved successfully",
	})
}
