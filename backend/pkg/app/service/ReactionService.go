package service

import (
	realtimeforum "social-network/backend"
	db "social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/reaction"
)

type ReactionService interface {
	UpsertReaction(userId string, entityType string, entityId int, score int) (reaction.ReactionResponse, error)
	GetUserScore(userId string, entityType string, entityId int) (int, error)
}

type ReactionServiceImpl struct {
	db db.ReactionRepository
}

func NewReactionService(database db.ReactionRepository) ReactionService {
	return ReactionServiceImpl{
		db: database,
	}
}

func (r ReactionServiceImpl) GetUserScore(userId string, entityType string, entityId int) (int, error) {
	return r.db.GetUserScore(userId, entityType, entityId)
}

func (r ReactionServiceImpl) UpsertReaction(userId string, entityType string, entityId int, score int) (reaction.ReactionResponse, error) {
	if !models.IsReactionEntityType(entityType) {
		return reaction.ReactionResponse{}, realtimeforum.ErrBadRequest
	}

	if score != 1 && score != -1 {
		return reaction.ReactionResponse{}, realtimeforum.ErrBadRequest
	}

	if entityId < 1 {
		return reaction.ReactionResponse{}, realtimeforum.ErrBadRequest
	}

	totalScore, err := r.db.UpsertReaction(userId, entityType, entityId, score)
	if err != nil {
		return reaction.ReactionResponse{}, err
	}

	return reaction.ReactionResponse{
		TotalScore: totalScore,
	}, nil
}
