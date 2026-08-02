package handlers

import (
	"encoding/json"
	"net/http"
	realtimeforum "real-time-forum"
	"real-time-forum/pkg/middleware"
	"real-time-forum/pkg/payload"
	"real-time-forum/pkg/payload/user"
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

func (re *HandlerContext) Register(w http.ResponseWriter, r *http.Request) {
	var req user.RegisterRequestDTO

	if err := req.ParseAndValidate(r); err != nil {
		re.HandleError(w, r, err)
		return
	}

	userID, token, err := re.AuthService.Register(req)
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

	re.App.Logger.Info("user registered and logged in successfully",
		"user_id", userID,
		"email", req.Email,
		"nickname", req.Nickname,
	)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(payload.SuccessResponse[registerResponse]{
		Success: true,
		Data: registerResponse{
			UserID:   userID,
			Nickname: req.Nickname,
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

	userID, token, err := re.AuthService.Login(identifier, password)
	if err != nil {
		re.HandleError(w, r, err)
		return
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

	if err := re.AuthService.Logout(tokenCookie.Value); err != nil {
		re.HandleError(w, r, err)
		return
	}

	// Drop the user's websocket registration so other users see them go
	// offline instantly, even if the client failed to notify us itself.
	if userID, ok := middleware.UserIDFromContext(r.Context()); ok && userID != "" && re.Hub != nil {
		if client := re.Hub.GetClientByUserID(userID); client != nil {
			re.Hub.Unregister <- client
		}
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   re.App.InProduction,
		SameSite: http.SameSiteLaxMode,
	})

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[logoutResponse]{
		Success: true,
		Data: logoutResponse{
			Message: "Logged out",
		},
		Message: "Logged out successfully",
	})
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