package service

import (
	"strings"
	"unicode/utf8"

	backend "social-network/backend"
	"social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/models"
)

type GroupService struct{ Repo *repositories.DB }

func (s *GroupService) Create(ownerID, title, description string, imageURL ...string) (models.Group, error) {
	title = strings.TrimSpace(title)
	description = strings.TrimSpace(description)
	if utf8.RuneCountInString(title) < 3 || utf8.RuneCountInString(title) > 100 || utf8.RuneCountInString(description) > 1000 {
		return models.Group{}, backend.ErrBadRequest
	}
	return s.Repo.CreateGroup(ownerID, title, description, imageURL...)
}

func (s *GroupService) RequireMember(groupID int, userID string) error {
	group, err := s.Repo.Group(groupID, userID)
	if err != nil {
		return err
	}
	if !group.IsMember {
		return backend.ErrNotFound
	}
	return nil
}

// RequestJoin records a join request and reports whether it is a new one that
// the owner should hear about.
func (s *GroupService) RequestJoin(groupID int, userID string) (bool, error) {
	group, err := s.Repo.Group(groupID, userID)
	if err != nil {
		return false, err
	}
	if group.IsMember {
		return false, backend.ErrBadRequest
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

// Invite records an invitation and reports whether it is a new one that the
// invitee should hear about.
func (s *GroupService) Invite(groupID int, inviterID, inviteeID string) (bool, error) {
	if inviteeID == "" {
		return false, backend.ErrBadRequest
	}
	if _, err := s.Repo.SocialProfile(inviteeID); err != nil {
		return false, err
	}
	group, err := s.Repo.Group(groupID, inviterID)
	if err != nil {
		return false, err
	}
	if !group.IsOwner && !group.IsMember {
		return false, backend.ErrForbidden
	}
	return s.Repo.AddGroupInvitation(groupID, inviterID, inviteeID)
}

func (s *GroupService) Invitations(userID string) ([]models.GroupInvitation, error) {
	return s.Repo.GroupInvitations(userID)
}

func (s *GroupService) DecideInvitation(groupID, invitationID int, userID, status string) error {
	if status != "accepted" && status != "declined" {
		return backend.ErrBadRequest
	}
	return s.Repo.GroupInvitationDecision(groupID, invitationID, userID, status)
}
