package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	backend "social-network/backend"
	"social-network/backend/pkg/middleware"
	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload"
	"social-network/backend/pkg/payload/posts"
)

func respond(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload.SuccessResponse[any]{Success: true, Data: data})
}

func (re *HandlerContext) decode(w http.ResponseWriter, r *http.Request, value any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(value); err != nil {
		re.HandleError(w, r, backend.ErrBadRequest)
		return false
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
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
	u, err := re.SocialService.Repo.SocialProfile(id, currentUser(r))
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
			u.Followers, u.Following = []string{}, []string{}
		}
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
	if r.Method == http.MethodDelete {
		if err := re.SocialService.Unfollow(actor, target); err != nil {
			re.HandleError(w, r, err)
			return
		}
		re.chatEvent(actor, target, "social_changed", map[string]string{"actorId": actor, "targetId": target})
		respond(w, http.StatusOK, nil)
		return
	}
	status, err := re.SocialService.Follow(actor, target)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	kind := "follow"
	if status == "pending" {
		kind = "follow_request"
	}
	re.socialNotification(actor, target, kind)
	re.chatEvent(actor, target, "social_changed", map[string]string{"actorId": actor, "targetId": target})
	respond(w, http.StatusOK, map[string]string{"status": status})
}

func (re *HandlerContext) FollowRequests(w http.ResponseWriter, r *http.Request) {
	offset, ok := re.offset(w, r)
	if !ok {
		return
	}
	items, err := re.SocialService.FollowRequests(currentUser(r), offset)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, items)
}

func (re *HandlerContext) DecideFollowRequest(w http.ResponseWriter, r *http.Request) {
	recipient, requester := currentUser(r), r.PathValue("userId")
	if err := re.SocialService.DecideFollowRequest(recipient, requester, r.Method == http.MethodPut); err != nil {
		re.HandleError(w, r, err)
		return
	}
	re.chatEvent(recipient, requester, "social_changed", map[string]string{"actorId": recipient, "targetId": requester})
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

// FollowLists serves the followers and following lists of one profile so the
// frontend can open them from the profile they belong to instead of a page.
func (re *HandlerContext) FollowLists(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("userId")
	if id == "" || id == "me" {
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
	u, err := re.SocialService.Repo.SocialProfile(id)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	groups := map[string][]string{"followers": u.Followers, "following": u.Following}
	result := map[string][]models.SocialUser{}
	for name, ids := range groups {
		result[name] = []models.SocialUser{}
		for _, memberID := range ids {
			profile, err := re.SocialService.Repo.SocialProfile(memberID, currentUser(r))
			if err != nil {
				re.HandleError(w, r, err)
				return
			}
			browsable, err := re.SocialService.CanViewProfile(currentUser(r), memberID)
			if err != nil {
				re.HandleError(w, r, err)
				return
			}
			if !browsable {
				// The avatar and nickname identify the entry, the rest stays private.
				profile.FirstName, profile.LastName, profile.Bio = "", "", ""
				profile.CoverPhoto, profile.Location = "", ""
				profile.Followers, profile.Following = []string{}, []string{}
			}
			result[name] = append(result[name], profile)
		}
	}
	respond(w, http.StatusOK, result)
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
