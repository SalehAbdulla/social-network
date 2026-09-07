package service

import (
	"encoding/json"
	"math"
	db "social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/posts"
)

type PostService interface {
	GetPosts(pageNumber int, pageSize int, sortBy string, sortOrder string, userId string) (posts.PostResponse, error)
	CreatePost(userID string, title string, content string, imageURLs ...string) (posts.PostDTO, error)
	GetPostByID(postId int, userId string) (posts.PostDTO, error)
	DeletePost(postId int, userID string) error
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
		PostId:          post.PostId,
		UserId:          post.UserId,
		Nickname:        post.Nickname,
		Title:           post.Title,
		Content:         post.Content,
		Score:           post.Score,
		CommentsCounter: post.CommentsCounter,
		UserScore:       userScore,
		CreatedAt:       post.CreatedAt,
		UpdatedAt:       post.UpdatedAt,
	}
}

func (p PostServiceImpl) GetPosts(pageNumber int, pageSize int, sortBy string, sortOrder string, userId string) (posts.PostResponse, error) {
	postsModel, totalElements, err := p.db.GetPosts(pageNumber, pageSize, sortBy, sortOrder)
	if err != nil {
		return posts.PostResponse{}, err
	}

	postDTOs := make([]posts.PostDTO, len(postsModel))
	for i, post := range postsModel {
		userScore, _ := p.reactionService.GetUserScore(userId, "post", post.PostId)
		postDTOs[i] = mapPostToDTO(post, userScore)
	}

	totalPages := int(math.Ceil(float64(totalElements) / float64(pageSize)))
	lastPage := pageNumber >= totalPages

	return posts.PostResponse{
		Posts:         postDTOs,
		PageNumber:    pageNumber,
		PageSize:      pageSize,
		TotalElements: totalElements,
		TotalPages:    totalPages,
		LastPage:      lastPage,
	}, nil
}

func (p PostServiceImpl) GetPostByID(postId int, userId string) (posts.PostDTO, error) {
	post, err := p.db.GetPostByID(postId)
	if err != nil {
		return posts.PostDTO{}, err
	}
	userScore, _ := p.reactionService.GetUserScore(userId, "post", postId)
	return mapPostToDTO(post, userScore), nil
}

func (p PostServiceImpl) DeletePost(postId int, userID string) error {
	return p.db.DeletePost(postId, userID)
}

func (p PostServiceImpl) CreatePost(userID string, title string, content string, imageURLs ...string) (posts.PostDTO, error) {
	if imageURLs == nil {
		imageURLs = []string{}
	}
	images, _ := json.Marshal(imageURLs)
	post := models.Post{
		ImageURLs: string(images),
		UserId:    userID,
		Title:     title,
		Content:   content,
	}

	createdPost, err := p.db.CreatePost(post)
	if err != nil {
		return posts.PostDTO{}, err
	}

	return mapPostToDTO(createdPost, 0), nil
}
