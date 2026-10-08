package service

import (
	"encoding/json"
	"math"
	db "social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/comment"
)

type CommentService interface {
	GetComments(postId int, pageNumber int, pageSize int, sortBy string, sortOrder string, userID string) (comment.CommentResponse, error)
	CreateComment(userID string, postId int, content string, imageURLs []string) (comment.CommentDTO, error)
	DeleteComment(commentId int, userId string) error
}

type CommentServiceImpl struct {
	db db.CommentRepository
}

func NewCommentService(database db.CommentRepository) CommentService {
	return CommentServiceImpl{
		db: database,
	}
}

func mapCommentToDTO(com models.Comment) comment.CommentDTO {
	images := []string{}
	_ = json.Unmarshal([]byte(com.ImageURLs), &images)
	return comment.CommentDTO{
		CommentId:   com.CommentId,
		PostId:      com.PostPublicID,
		UserId:      com.UserId,
		Nickname:    com.Nickname,
		CommentText: com.CommentText,
		ImageURLs:   images,
		Score:       com.Score,
		UserScore:   com.UserScore,
		CreatedAt:   com.CreatedAt,
	}
}

func (c CommentServiceImpl) GetComments(postId int, pageNumber int, pageSize int, sortBy string, sortOrder string, userID string) (comment.CommentResponse, error) {
	comments, totalElements, err := c.db.GetComments(postId, pageNumber, pageSize, sortBy, sortOrder, userID)
	if err != nil {
		return comment.CommentResponse{}, err
	}

	dtos := make([]comment.CommentDTO, len(comments))
	for i, com := range comments {
		dtos[i] = mapCommentToDTO(com)
	}

	totalPages := int(math.Ceil(float64(totalElements) / float64(pageSize)))
	lastPage := pageNumber >= totalPages

	return comment.CommentResponse{
		Comments:      dtos,
		PageNumber:    pageNumber,
		PageSize:      pageSize,
		TotalElements: totalElements,
		TotalPages:    totalPages,
		LastPage:      lastPage,
	}, nil
}

func (c CommentServiceImpl) CreateComment(userId string, postId int, content string, imageURLs []string) (comment.CommentDTO, error) {
	if imageURLs == nil {
		imageURLs = []string{}
	}
	images, err := json.Marshal(imageURLs)
	if err != nil {
		return comment.CommentDTO{}, err
	}

	createdComment, err := c.db.CreateComment(userId, postId, content, string(images))
	if err != nil {
		return comment.CommentDTO{}, err
	}

	return mapCommentToDTO(createdComment), nil
}

func (c CommentServiceImpl) DeleteComment(commentId int, userId string) error {
	return c.db.DeleteComment(commentId, userId)
}
