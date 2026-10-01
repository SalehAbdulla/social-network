package handlers

import (
	"encoding/json"
	"net/http"
	realtimeforum "social-network/backend"
	"social-network/backend/pkg/middleware"
	"social-network/backend/pkg/payload"
	"social-network/backend/pkg/payload/posts"
	"strconv"
	"strings"
)

func (re *HandlerContext) GetPost(w http.ResponseWriter, r *http.Request) {
	postIdStr := r.URL.Query().Get("id")

	postId, err := strconv.Atoi(postIdStr)
	if err != nil || postId < 1 {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	response, err := re.PostService.GetPostByID(postId, userID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[posts.PostDTO]{
		Success: true,
		Data:    response,
		Message: "Posts retrieved successfully",
	})
}

func (re *HandlerContext) GetPosts(w http.ResponseWriter, r *http.Request) {
	pageNumberStr := r.URL.Query().Get("page")
	if pageNumberStr == "" {
		pageNumberStr = "1"
	}

	pageSizeStr := r.URL.Query().Get("size")
	if pageSizeStr == "" {
		pageSizeStr = "10"
	}

	sortBy := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("sortBy")))
	if sortBy == "" {
		sortBy = "createdat"
	}

	sortOrder := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("sortOrder")))
	if sortOrder == "" {
		sortOrder = "desc"
	}

	pageNumber, err := strconv.Atoi(pageNumberStr)
	if err != nil || pageNumber < 1 {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	pageSize, err := strconv.Atoi(pageSizeStr)
	if err != nil || pageSize < 1 || pageSize > 100 {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	validSortBy := map[string]bool{
		"createdat": true,
		"title":     true,
		"score":     true,
	}

	if !validSortBy[sortBy] {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	validSortOrder := map[string]bool{
		"asc":  true,
		"desc": true,
	}

	if !validSortOrder[sortOrder] {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	response, err := re.PostService.GetPosts(pageNumber, pageSize, sortBy, sortOrder, userID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[posts.PostResponse]{
		Success: true,
		Data:    response,
		Message: "Posts retrieved successfully",
	})
}

type CreatePostRequest struct {
	Title         string   `json:"title"`
	Content       string   `json:"content"`
	Privacy       string   `json:"privacy"`
	SelectedUsers []string `json:"selectedFollowerIds"`
	ImageURLs     []string `json:"imageUrls"`
}

func (re *HandlerContext) DeletePost(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	postIdStr := r.URL.Query().Get("id")
	postId, err := strconv.Atoi(postIdStr)
	if err != nil || postId < 1 {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}

	err = re.PostService.DeletePost(postId, userID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	re.App.Logger.Info("post deleted successfully",
		"post_id", postId,
		"user_id", userID,
	)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[interface{}]{
		Success: true,
		Data:    nil,
		Message: "Post deleted successfully",
	})
}

func (re *HandlerContext) CreatePost(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok || userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}

	req, valid := re.postInput(w, r, userID)
	if !valid {
		return
	}

	response, err := re.PostService.CreatePost(userID, req.Title, req.Content, req.Privacy, req.SelectedUsers, req.ImageURLs...)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	re.App.Logger.Info("post created successfully",
		"post_id", response.PostId,
		"user_id", userID,
	)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(payload.SuccessResponse[posts.PostDTO]{
		Success: true,
		Data:    response,
		Message: "Post created successfully",
	})
}

func (re *HandlerContext) postInput(w http.ResponseWriter, r *http.Request, userID string) (CreatePostRequest, bool) {
	var req CreatePostRequest
	if !re.parseForm(w, r) {
		return req, false
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return req, false
	}

	title := strings.TrimSpace(req.Title)
	content := strings.TrimSpace(req.Content)

	if (title != "" && len(title) < 3) || len(title) > 30 {
		re.HandleError(w, r, realtimeforum.ErrTitleLength)
		return req, false
	}

	if !isASCII(title) {
		re.HandleError(w, r, realtimeforum.ErrNonASCII)
		return req, false
	}

	if (len(content) < 10 && len(req.ImageURLs) == 0) || len(content) > 500 {
		re.HandleError(w, r, realtimeforum.ErrContentLength)
		return req, false
	}

	if !isASCII(content) {
		re.HandleError(w, r, realtimeforum.ErrNonASCII)
		return req, false
	}

	if len(req.ImageURLs) > 4 {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return req, false
	}
	for _, url := range req.ImageURLs {
		if url == "" {
			re.HandleError(w, r, realtimeforum.ErrBadRequest)
			return req, false
		}
		if err := re.SocialService.ValidateMedia(userID, url, "image"); err != nil {
			re.HandleError(w, r, err)
			return req, false
		}
	}
	req.Title, req.Content = title, content
	return req, true
}

func (re *HandlerContext) UpdatePost(w http.ResponseWriter, r *http.Request) {
	postID, err := strconv.Atoi(r.PathValue("postId"))
	if err != nil || postID < 1 {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}
	userID := currentUser(r)
	req, valid := re.postInput(w, r, userID)
	if !valid {
		return
	}
	post, err := re.PostService.UpdatePost(postID, userID, req.Title, req.Content, req.Privacy, req.SelectedUsers, req.ImageURLs...)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, post)
}

// SearchPosts is the post half of the search page: `/api/v1/posts/search?q=`. A
// blank query is refused rather than answered, because the empty pattern it would
// become (`%%`) matches every post — so an accidental submit would read the whole
// feed back rather than nothing.
func (re *HandlerContext) SearchPosts(w http.ResponseWriter, r *http.Request) {
	search := strings.TrimSpace(r.URL.Query().Get("q"))
	if search == "" {
		re.HandleError(w, r, realtimeforum.ErrBadRequest)
		return
	}
	pageNumber, pageSize, ok := re.pageParams(w, r)
	if !ok {
		return
	}
	userID := currentUser(r)
	if userID == "" {
		re.HandleError(w, r, realtimeforum.ErrUnauthorized)
		return
	}
	response, err := re.PostService.SearchPosts(search, pageNumber, pageSize, userID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, response)
}
