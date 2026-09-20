package service

import (
	"regexp"
	"strings"
	"unicode/utf8"

	backend "social-network/backend"
	"social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/models"
)

type SocialService struct{ Repo *repositories.DB }

var nicknamePattern = regexp.MustCompile(`^[a-z0-9_]{2,33}$`)
var colorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func (s *SocialService) ValidateMedia(userID, url, kind string) error {
	if url == "" {
		return nil
	}
	const prefix = "/api/v1/media/"
	if !strings.HasPrefix(url, prefix) {
		return backend.ErrBadRequest
	}
	owner, mime, err := s.Repo.MediaInfo(strings.TrimPrefix(url, prefix))
	if err != nil {
		return err
	}
	if owner != userID {
		return backend.ErrForbidden
	}
	if kind != "" && !strings.HasPrefix(mime, kind+"/") {
		return backend.ErrBadRequest
	}
	return nil
}

func (s *SocialService) UpdateProfile(u models.SocialUser) (models.SocialUser, error) {
	u.Location = strings.TrimSpace(u.Location)
	u.Nickname = strings.ToLower(strings.TrimSpace(u.Nickname))
	u.FirstName, u.LastName = strings.TrimSpace(u.FirstName), strings.TrimSpace(u.LastName)
	if !nicknamePattern.MatchString(u.Nickname) || u.FirstName == "" || u.LastName == "" || utf8.RuneCountInString(u.FirstName) > 50 || utf8.RuneCountInString(u.LastName) > 50 || utf8.RuneCountInString(u.Bio) > 1000 || utf8.RuneCountInString(u.Location) > 50 {
		return u, backend.ErrBadRequest
	}
	for _, url := range []string{u.Avatar, u.CoverPhoto} {
		if err := s.ValidateMedia(u.UserID, url, "image"); err != nil {
			return u, err
		}
	}
	if err := s.Repo.UpdateSocialProfile(u); err != nil {
		return u, err
	}
	return s.Repo.SocialProfile(u.UserID)
}

func (s *SocialService) ValidateTarget(actor, target string) error {
	if actor == target || target == "" {
		return backend.ErrBadRequest
	}
	return s.Repo.DoesUserExists(target)
}

func (s *SocialService) CanViewProfile(viewerID, profileID string) (bool, error) {
	return s.Repo.CanViewPrivateProfile(viewerID, profileID)
}

func (s *SocialService) CanViewMedia(mediaID, viewerID string) (bool, error) {
	return s.Repo.CanViewMedia(mediaID, viewerID)
}

func (s *SocialService) AddStory(story models.Story) (int, error) {
	story.Content = strings.TrimSpace(story.Content)
	if utf8.RuneCountInString(story.Content) > 1000 || !colorPattern.MatchString(story.BackgroundColor) {
		return 0, backend.ErrBadRequest
	}
	if story.MediaType == "text" {
		if story.Content == "" || story.MediaURL != "" {
			return 0, backend.ErrBadRequest
		}
	} else {
		if (story.MediaType != "image" && story.MediaType != "video") || story.MediaURL == "" {
			return 0, backend.ErrBadRequest
		}
		if err := s.ValidateMedia(story.UserID, story.MediaURL, story.MediaType); err != nil {
			return 0, err
		}
	}
	return s.Repo.CreateStory(story)
}
