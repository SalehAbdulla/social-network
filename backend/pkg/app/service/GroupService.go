package service

import (
	"strings"
	"unicode/utf8"

	backend "social-network/backend"
	"social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/models"
)

type GroupService struct{ Repo *repositories.DB }

func (s *GroupService) Create(ownerID, title, description string) (models.Group, error) {
	title = strings.TrimSpace(title)
	description = strings.TrimSpace(description)
	if utf8.RuneCountInString(title) < 3 || utf8.RuneCountInString(title) > 100 || utf8.RuneCountInString(description) > 1000 {
		return models.Group{}, backend.ErrBadRequest
	}
	return s.Repo.CreateGroup(ownerID, title, description)
}

func (s *GroupService) RequireMember(groupID int, userID string) error {
	group, err := s.Repo.Group(groupID, userID)
	if err != nil {
		return err
	}
	if !group.IsMember {
		return backend.ErrForbidden
	}
	return nil
}

func (s *GroupService) RequestJoin(groupID int, userID string) error {
	group, err := s.Repo.Group(groupID, userID)
	if err != nil {
		return err
	}
	if group.IsMember {
		return backend.ErrBadRequest
	}
	return s.Repo.AddGroupRequest(groupID, userID)
}

func (s *GroupService) Decide(groupID, requestID int, ownerID, status string) error {
	group, err := s.Repo.Group(groupID, ownerID)
	if err != nil {
		return err
	}
	if !group.IsOwner {
		return backend.ErrForbidden
	}
	if status != "accepted" && status != "declined" {
		return backend.ErrBadRequest
	}
	return s.Repo.GroupRequestDecision(groupID, requestID, status)
}
