package handlers

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	backend "social-network/backend"
	"social-network/backend/pkg/app/service"
	"social-network/backend/pkg/middleware"
	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload"
	"social-network/backend/pkg/payload/posts"

	"github.com/google/uuid"
)

func respond(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload.SuccessResponse[any]{Success: true, Data: data})
}

func (re *HandlerContext) decode(w http.ResponseWriter, r *http.Request, value any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(value); err != nil {
		re.HandleError(w, r, backend.ErrBadRequest)
		return false
	}
	return true
}

func (re *HandlerContext) allowedOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	return u.Host == r.Host || origin == re.App.FrontendOrigin
}

// DevSession is registered only when explicitly enabled outside production.
// It creates a normal session; protected routes still require their session cookie.
func (re *HandlerContext) DevSession(w http.ResponseWriter, r *http.Request) {
	if !re.App.DevDummyUser || re.App.InProduction {
		re.NotFound(w, r)
		return
	}
	if !re.allowedOrigin(r) {
		re.HandleError(w, r, backend.ErrForbidden)
		return
	}
	var req struct {
		Email string `json:"email"`
	}
	if !re.decode(w, r, &req) {
		return
	}
	if req.Email == "" {
		req.Email = "dummy@example.com"
	}
	if req.Email != "dummy@example.com" && req.Email != "alex@example.com" {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	id, _, err := re.SocialService.Repo.GetUserCredentials(req.Email)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	profile, err := re.SocialService.Repo.SocialProfile(id)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	token := ""
	if cookie, err := r.Cookie("session_token"); err == nil {
		if uid, ok := service.DefaultSessionManager.GetUserIdByToken(cookie.Value); ok && uid == id {
			token = cookie.Value
		}
	}
	if token == "" {
		token = uuid.NewString()
		service.DefaultSessionManager.CreateSession(id, token)
	}
	http.SetCookie(w, &http.Cookie{Name: "session_token", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode})
	respond(w, http.StatusOK, profile)
}

func currentUser(r *http.Request) string {
	id, _ := middleware.UserIDFromContext(r.Context())
	return id
}

func (re *HandlerContext) offset(w http.ResponseWriter, r *http.Request) (int, bool) {
	value := r.URL.Query().Get("offset")
	if value == "" {
		return 0, true
	}
	n, err := strconv.Atoi(value)
	if err != nil || n < 0 {
		re.HandleError(w, r, backend.ErrBadRequest)
		return 0, false
	}
	return n, true
}

func (re *HandlerContext) UserProfile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("userId")
	if id == "" || id == "me" {
		id = currentUser(r)
	}
	u, err := re.SocialService.Repo.SocialProfile(id)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	if id != currentUser(r) {
		visible, err := re.SocialService.CanViewProfile(currentUser(r), id)
		if err != nil {
			re.HandleError(w, r, err)
			return
		}
		if !visible {
			u.FirstName, u.LastName, u.Bio, u.Avatar, u.CoverPhoto, u.Location = "", "", "", "", "", ""
			u.Followers, u.Following, u.Connections = []string{}, []string{}, []string{}
		}
		u.Pending, u.Requested = []string{}, []string{}
	}
	respond(w, http.StatusOK, u)
}

func (re *HandlerContext) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	var u models.SocialUser
	if !re.decode(w, r, &u) {
		return
	}
	u.UserID = currentUser(r)
	u, err := re.SocialService.UpdateProfile(u)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, u)
}

func (re *HandlerContext) Discover(w http.ResponseWriter, r *http.Request) {
	offset, ok := re.offset(w, r)
	if !ok {
		return
	}
	users, err := re.SocialService.Repo.DiscoverUsers(currentUser(r), strings.TrimSpace(r.URL.Query().Get("q")), offset)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, users)
}

func (re *HandlerContext) ProfilePosts(w http.ResponseWriter, r *http.Request) {
	offset, ok := re.offset(w, r)
	if !ok {
		return
	}
	id := r.PathValue("userId")
	if id == "me" {
		id = currentUser(r)
	}
	if err := re.SocialService.Repo.DoesUserExists(id); err != nil {
		re.HandleError(w, r, err)
		return
	}
	visible, err := re.SocialService.CanViewProfile(currentUser(r), id)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	if !visible {
		re.HandleError(w, r, backend.ErrForbidden)
		return
	}
	ids, err := re.SocialService.Repo.ProfilePostIDs(id, r.URL.Query().Get("liked") == "true", offset, currentUser(r))
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	items := []posts.PostDTO{}
	for _, raw := range ids {
		postID, _ := strconv.Atoi(raw)
		post, err := re.PostService.GetPostByID(postID, currentUser(r))
		if err != nil {
			re.HandleError(w, r, err)
			return
		}
		items = append(items, post)
	}
	respond(w, http.StatusOK, items)
}

func (re *HandlerContext) Follow(w http.ResponseWriter, r *http.Request) {
	actor, target := currentUser(r), r.PathValue("userId")
	if err := re.SocialService.ValidateTarget(actor, target); err != nil {
		re.HandleError(w, r, err)
		return
	}
	changed, err := re.SocialService.Repo.FollowUser(actor, target, r.Method == http.MethodPut)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	if changed {
		if r.Method == http.MethodPut {
			re.socialNotification(actor, target, "follow")
		}
		re.chatEvent(actor, target, "social_changed", map[string]string{"actorId": actor, "targetId": target})
	}
	respond(w, http.StatusOK, nil)
}

func (re *HandlerContext) socialNotification(actor, target, kind string) {
	notification, err := re.NotificationService.CreateNotification(target, actor, kind, 0)
	if err != nil {
		re.App.Logger.Error("social notification failed", "error", err)
		return
	}
	if re.Hub != nil {
		data, _ := json.Marshal(map[string]any{"type": "notification", "payload": notification})
		re.Hub.SendToUser(target, data)
	}
}

func (re *HandlerContext) Connections(w http.ResponseWriter, r *http.Request) {
	u, err := re.SocialService.Repo.SocialProfile(currentUser(r))
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	groups := map[string][]string{"followers": u.Followers, "following": u.Following, "connections": u.Connections, "pending": u.Pending, "requested": u.Requested}
	result := map[string][]models.SocialUser{}
	for name, ids := range groups {
		result[name] = []models.SocialUser{}
		for _, id := range ids {
			profile, err := re.SocialService.Repo.SocialProfile(id)
			if err != nil {
				re.HandleError(w, r, err)
				return
			}
			profile.Pending, profile.Requested = []string{}, []string{}
			result[name] = append(result[name], profile)
		}
	}
	respond(w, http.StatusOK, result)
}

func (re *HandlerContext) ChangeConnection(w http.ResponseWriter, r *http.Request) {
	actor, target := currentUser(r), r.PathValue("userId")
	if err := re.SocialService.ValidateTarget(actor, target); err != nil {
		re.HandleError(w, r, err)
		return
	}
	action := map[string]string{http.MethodPost: "request", http.MethodPut: "accept", http.MethodDelete: "remove"}[r.Method]
	changed, err := re.SocialService.Repo.ChangeConnection(actor, target, action)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	if changed {
		if action != "remove" {
			re.socialNotification(actor, target, "connection")
		}
		re.chatEvent(actor, target, "social_changed", map[string]string{"actorId": actor, "targetId": target})
	}
	respond(w, http.StatusOK, nil)
}

func (re *HandlerContext) Stories(w http.ResponseWriter, r *http.Request) {
	offset, ok := re.offset(w, r)
	if !ok {
		return
	}
	items, err := re.SocialService.Repo.Stories(offset)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, items)
}

func (re *HandlerContext) CreateStory(w http.ResponseWriter, r *http.Request) {
	var s models.Story
	if !re.decode(w, r, &s) {
		return
	}
	s.UserID = currentUser(r)
	id, err := re.SocialService.AddStory(s)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusCreated, map[string]int{"storyId": id})
}

func (re *HandlerContext) resourceID(w http.ResponseWriter, r *http.Request) (int, bool) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		re.HandleError(w, r, backend.ErrBadRequest)
		return 0, false
	}
	return id, true
}

func (re *HandlerContext) DeleteStory(w http.ResponseWriter, r *http.Request) {
	id, ok := re.resourceID(w, r)
	if !ok {
		return
	}
	if err := re.SocialService.Repo.DeleteStory(id, currentUser(r)); err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, nil)
}

func (re *HandlerContext) EditComment(w http.ResponseWriter, r *http.Request) {
	id, ok := re.resourceID(w, r)
	if !ok {
		return
	}
	var req struct {
		Content string `json:"content"`
	}
	if !re.decode(w, r, &req) {
		return
	}
	req.Content = strings.TrimSpace(req.Content)
	if utf8.RuneCountInString(req.Content) < 3 || utf8.RuneCountInString(req.Content) > 300 {
		re.HandleError(w, r, backend.ErrCommentLength)
		return
	}
	if err := re.SocialService.Repo.EditComment(id, currentUser(r), req.Content); err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, nil)
}
