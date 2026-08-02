package service

import (
	"math"
	"real-time-forum/pkg/payload/comment"
	db "real-time-forum/pkg/app/repositories"
)

type CommentService interface {
	GetComments(postId int, pageNumber int, pageSize int, sortBy string, sortOrder string, userID string) (comment.CommentResponse, error)
	CreateComment(userID string, postId int, content string) (comment.CommentDTO, error)
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

func (c CommentServiceImpl) GetComments(postId int, pageNumber int, pageSize int, sortBy string, sortOrder string, userID string) (comment.CommentResponse, error) {
	comments, totalElements, err := c.db.GetComments(postId, pageNumber, pageSize, sortBy, sortOrder, userID)
	if err != nil {
		return comment.CommentResponse{}, err
	}

	dtos := make([]comment.CommentDTO, len(comments))
	for i, com := range comments {
		dtos[i] = comment.CommentDTO{
			CommentId:   com.CommentId,
			PostId:      com.PostId,
			UserId:      com.UserId,
			Nickname:    com.Nickname,
			CommentText: com.CommentText,
			Score:       com.Score,
			UserScore:   com.UserScore,
			CreatedAt:   com.CreatedAt,
		}
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

func (c CommentServiceImpl) CreateComment(userId string, postId int, content string) (comment.CommentDTO, error) {
	createdComment, err := c.db.CreateComment(userId, postId, content)
	if err != nil {
		return comment.CommentDTO{}, err
	}

	return comment.CommentDTO{
		CommentId:   createdComment.CommentId,
		PostId:      createdComment.PostId,
		UserId:      createdComment.UserId,
		CommentText: createdComment.CommentText,
		CreatedAt:   createdComment.CreatedAt,
	}, nil
}

func (c CommentServiceImpl) DeleteComment(commentId int, userId string) error {
	return c.db.DeleteComment(commentId, userId)
}
