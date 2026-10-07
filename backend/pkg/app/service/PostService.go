package service

import (
	"encoding/json"
	"math"
	realtimeforum "social-network/backend"
	db "social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/posts"
)

type PostService interface {
	GetPosts(pageNumber int, pageSize int, sortBy string, sortOrder string, userId string) (posts.PostResponse, error)
	CreatePost(userID string, title string, content string, privacy string, selectedUsers []string, imageURLs ...string) (posts.PostDTO, error)
	UpdatePost(postID int, userID string, title string, content string, privacy string, selectedUsers []string, imageURLs ...string) (posts.PostDTO, error)
	GetPostByID(postId int, userId string) (posts.PostDTO, error)
	DeletePost(postId int, userID string) error
	// Bookmarks. SavePost refuses a post the account cannot read, so a save never
	// confirms the existence of something the viewer is not allowed to see.
	SavePost(userID string, postID int) error
	UnsavePost(userID string, postID int) error
	GetSavedPosts(pageNumber int, pageSize int, userID string) (posts.PostResponse, error)
	// SearchPosts is the post half of the search page. It inherits the feed's
	// visibility rule through the repository, so it can only return posts the
	// viewer was already allowed to open.
	SearchPosts(search string, pageNumber int, pageSize int, userID string) (posts.PostResponse, error)
	// HashtagPosts is one tag's results page, in the same shape as the feed.
	HashtagPosts(tag string, pageNumber int, pageSize int, userID string) (posts.PostResponse, error)
	// PostInsights is the author's own view of one post: how far it reaches, and what it
	// has drawn. Read access is checked before ownership, so a post the viewer may not
	// open answers the 404 a read gives rather than confirming that it exists.
	PostInsights(publicID string, viewerID string) (posts.PostInsightsDTO, error)
}

type PostServiceImpl struct {
	db              db.PostRepository
	reactionService ReactionService
}

func NewPostService(database db.PostRepository, rs ReactionService) PostService {
	return PostServiceImpl{
		db:              database,
		reactionService: rs,
	}
}

func mapPostToDTO(post models.Post, userScore int) posts.PostDTO {
	images := []string{}
	_ = json.Unmarshal([]byte(post.ImageURLs), &images)
	return posts.PostDTO{
		ImageURLs:       images,
		PostId:          post.PublicID,
		UserId:          post.UserId,
		Nickname:        post.Nickname,
		FirstName:       post.FirstName,
		LastName:        post.LastName,
		Title:           post.Title,
		Content:         post.Content,
		Score:           post.Score,
		CommentsCounter: post.CommentsCounter,
		UserScore:       userScore,
		IsSaved:         post.IsSaved,
		CreatedAt:       post.CreatedAt,
		UpdatedAt:       post.UpdatedAt,
		Privacy:         post.Privacy,
		SelectedUsers:   post.SelectedUsers,
	}
}

func (p PostServiceImpl) GetPosts(pageNumber int, pageSize int, sortBy string, sortOrder string, userId string) (posts.PostResponse, error) {
	postsModel, totalElements, err := p.db.GetPosts(pageNumber, pageSize, sortBy, sortOrder, userId)
	if err != nil {
		return posts.PostResponse{}, err
	}
	return p.pageResponse(postsModel, totalElements, pageNumber, pageSize, userId)
}

// SearchPosts is the post half of the search page. The query is the repository's;
// everything a caller sees is shaped here, so a search result is the same kind of
// object as a feed card.
func (p PostServiceImpl) SearchPosts(search string, pageNumber int, pageSize int, userID string) (posts.PostResponse, error) {
	postsModel, totalElements, err := p.db.SearchPosts(search, pageNumber, pageSize, userID)
	if err != nil {
		return posts.PostResponse{}, err
	}
	return p.pageResponse(postsModel, totalElements, pageNumber, pageSize, userID)
}

// HashtagPosts is one tag's results page, in the same shape as the feed and the search.
func (p PostServiceImpl) HashtagPosts(tag string, pageNumber int, pageSize int, userID string) (posts.PostResponse, error) {
	postsModel, totalElements, err := p.db.HashtagPosts(tag, pageNumber, pageSize, userID)
	if err != nil {
		return posts.PostResponse{}, err
	}
	return p.pageResponse(postsModel, totalElements, pageNumber, pageSize, userID)
}

// pageResponse decorates one page of posts with the viewer-relative flags and the
// reaction score, and shapes the answer the feed and the search both give. The two
// differ only in how they obtained their rows, which is why the shaping lives in one
// place: a page that forgot to fill `isSaved` would draw an empty bookmark on a post
// the viewer had saved.
func (p PostServiceImpl) pageResponse(postsModel []models.Post, totalElements, pageNumber, pageSize int, userId string) (posts.PostResponse, error) {
	// One query settles which of the page's posts this viewer has bookmarked,
	// rather than one query per card.
	postIDs := make([]int, len(postsModel))
	for i, post := range postsModel {
		postIDs[i] = post.PostId
	}
	saved, err := p.db.SavedPostIDs(userId, postIDs)
	if err != nil {
		return posts.PostResponse{}, err
	}

	postDTOs := make([]posts.PostDTO, len(postsModel))
	for i, post := range postsModel {
		post.IsSaved = saved[post.PostId]
		userScore, _ := p.reactionService.GetUserScore(userId, "post", post.PostId)
		postDTOs[i] = mapPostToDTO(post, userScore)
	}

	totalPages := int(math.Ceil(float64(totalElements) / float64(pageSize)))

	return posts.PostResponse{
		Posts:         postDTOs,
		PageNumber:    pageNumber,
		PageSize:      pageSize,
		TotalElements: totalElements,
		TotalPages:    totalPages,
		LastPage:      pageNumber >= totalPages,
	}, nil
}

func (p PostServiceImpl) GetPostByID(postId int, userId string) (posts.PostDTO, error) {
	post, err := p.db.GetPostByID(postId, userId)
	if err != nil {
		return posts.PostDTO{}, err
	}
	// GetPostByID is the single-post path, so the saved flag is one lookup rather
	// than the page-wide query GetPosts uses.
	saved, err := p.db.IsPostSaved(userId, postId)
	if err != nil {
		return posts.PostDTO{}, err
	}
	post.IsSaved = saved
	userScore, _ := p.reactionService.GetUserScore(userId, "post", postId)
	return mapPostToDTO(post, userScore), nil
}

// SavePost bookmarks a post for one account. The post has to be readable by that
// account first, so saving goes through the same visibility fragment every other
// read path uses and answers 404 for a post the viewer may not see — the same
// answer GetPostByID gives, which is what keeps this from being a way to probe
// for posts that exist.
func (p PostServiceImpl) SavePost(userID string, postID int) error {
	allowed, err := p.db.CanViewPost(postID, userID)
	if err != nil {
		return err
	}
	if !allowed {
		return realtimeforum.ErrNotFound
	}
	return p.db.SavePost(userID, postID)
}

func (p PostServiceImpl) UnsavePost(userID string, postID int) error {
	return p.db.UnsavePost(userID, postID)
}

// GetSavedPosts is the bookmark list, in the feed's response shape so the same
// paging contract holds. Every row is bookmarked by definition, so `isSaved` is
// true throughout; the list is filtered by the same visibility rule as the feed,
// which is why it is built here rather than by selecting ids and re-reading them.
func (p PostServiceImpl) GetSavedPosts(pageNumber int, pageSize int, userID string) (posts.PostResponse, error) {
	savedPosts, totalElements, err := p.db.SavedPosts(userID, pageNumber, pageSize)
	if err != nil {
		return posts.PostResponse{}, err
	}

	postDTOs := make([]posts.PostDTO, len(savedPosts))
	for i, post := range savedPosts {
		userScore, _ := p.reactionService.GetUserScore(userID, "post", post.PostId)
		postDTOs[i] = mapPostToDTO(post, userScore)
	}

	totalPages := int(math.Ceil(float64(totalElements) / float64(pageSize)))

	return posts.PostResponse{
		Posts:         postDTOs,
		PageNumber:    pageNumber,
		PageSize:      pageSize,
		TotalElements: totalElements,
		TotalPages:    totalPages,
		LastPage:      pageNumber >= totalPages,
	}, nil
}

func (p PostServiceImpl) DeletePost(postId int, userID string) error {
	return p.db.DeletePost(postId, userID)
}

func (p PostServiceImpl) CreatePost(userID string, title string, content string, privacy string, selectedUsers []string, imageURLs ...string) (posts.PostDTO, error) {
	post, err := p.preparePost(userID, title, content, privacy, selectedUsers, imageURLs)
	if err != nil {
		return posts.PostDTO{}, err
	}
	createdPost, err := p.db.CreatePost(post)
	if err != nil {
		return posts.PostDTO{}, err
	}
	return mapPostToDTO(createdPost, 0), nil
}

func (p PostServiceImpl) UpdatePost(postID int, userID string, title string, content string, privacy string, selectedUsers []string, imageURLs ...string) (posts.PostDTO, error) {
	current, err := p.db.GetPostByID(postID, userID)
	if err != nil {
		return posts.PostDTO{}, err
	}
	if current.UserId != userID {
		return posts.PostDTO{}, realtimeforum.ErrForbidden
	}
	post, err := p.preparePost(userID, title, content, privacy, selectedUsers, imageURLs)
	if err != nil {
		return posts.PostDTO{}, err
	}
	post.PostId = postID
	if _, err = p.db.UpdatePost(post); err != nil {
		return posts.PostDTO{}, err
	}
	return p.GetPostByID(postID, userID)
}

// PostInsights gathers the author's own view of one post: the size of the audience its
// privacy level actually admits, the reactions it has drawn and how they fall across the
// days they arrived, and its comment count.
//
// It is the one post read that is not viewer-relative, which is exactly why it is
// restricted. A post the viewer may not open answers the same 404 a read gives — so the
// path cannot be used to confirm that a post exists — and a post they may open but did
// not write answers 403, the answer UpdatePost gives for the same "not yours".
func (p PostServiceImpl) PostInsights(publicID string, viewerID string) (posts.PostInsightsDTO, error) {
	postID, err := p.db.PostIDByPublicID(publicID)
	if err != nil {
		return posts.PostInsightsDTO{}, err
	}
	allowed, err := p.db.CanViewPost(postID, viewerID)
	if err != nil {
		return posts.PostInsightsDTO{}, err
	}
	if !allowed {
		return posts.PostInsightsDTO{}, realtimeforum.ErrNotFound
	}
	insights, err := p.db.PostInsights(postID)
	if err != nil {
		return posts.PostInsightsDTO{}, err
	}
	if insights.AuthorId != viewerID {
		return posts.PostInsightsDTO{}, realtimeforum.ErrForbidden
	}
	days := make([]posts.ReactionDayDTO, 0, len(insights.Days))
	for _, day := range insights.Days {
		days = append(days, posts.ReactionDayDTO{Day: day.Day, Total: day.Total, Up: day.Up, Down: day.Down})
	}
	return posts.PostInsightsDTO{
		PostId:    publicID,
		Reach:     posts.PostAudienceDTO{Audience: insights.Audience, Count: insights.Reach},
		Reactions: insights.Reactions,
		Up:        insights.Up,
		Down:      insights.Down,
		Comments:  insights.Comments,
		Days:      days,
	}, nil
}

func (p PostServiceImpl) preparePost(userID, title, content, privacy string, selectedUsers, imageURLs []string) (models.Post, error) {
	if privacy == "" {
		privacy = "public"
	}
	if privacy != "public" && privacy != "followers" && privacy != "selected" {
		return models.Post{}, realtimeforum.ErrBadRequest
	}
	if privacy == "selected" {
		if len(selectedUsers) == 0 {
			return models.Post{}, realtimeforum.ErrBadRequest
		}
		if err := p.db.ValidateSelectedFollowers(userID, selectedUsers); err != nil {
			return models.Post{}, err
		}
	} else if len(selectedUsers) > 0 {
		return models.Post{}, realtimeforum.ErrBadRequest
	}
	if imageURLs == nil {
		imageURLs = []string{}
	}
	images, _ := json.Marshal(imageURLs)
	post := models.Post{
		ImageURLs:     string(images),
		UserId:        userID,
		Title:         title,
		Content:       content,
		Privacy:       privacy,
		SelectedUsers: selectedUsers,
	}

	return post, nil
}
