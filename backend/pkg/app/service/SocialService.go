package service

import (
	"net/mail"
	"net/url"
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

var phonePattern = regexp.MustCompile(`^\+?[0-9 ().\-]{5,29}$`)

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
	u.Website = strings.TrimSpace(u.Website)
	u.ContactEmail = strings.TrimSpace(u.ContactEmail)
	u.Phone = strings.TrimSpace(u.Phone)
	if u.Website != "" && !strings.HasPrefix(u.Website, "http://") && !strings.HasPrefix(u.Website, "https://") {
		u.Website = "https://" + u.Website
	}
	if !nicknamePattern.MatchString(u.Nickname) || u.FirstName == "" || u.LastName == "" || utf8.RuneCountInString(u.FirstName) > 50 || utf8.RuneCountInString(u.LastName) > 50 || utf8.RuneCountInString(u.Bio) > 1000 || utf8.RuneCountInString(u.Location) > 50 || utf8.RuneCountInString(u.Website) > 200 || utf8.RuneCountInString(u.ContactEmail) > 254 || utf8.RuneCountInString(u.Phone) > 30 {
		return u, backend.ErrBadRequest
	}
	if u.Website != "" {
		parsed, err := url.Parse(u.Website)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			return u, backend.ErrBadRequest
		}
	}
	if u.ContactEmail != "" {
		if _, err := mail.ParseAddress(u.ContactEmail); err != nil {
			return u, backend.ErrBadRequest
		}
	}
	if u.Phone != "" && !phonePattern.MatchString(u.Phone) {
		return u, backend.ErrBadRequest
	}
	for _, asset := range []string{u.Avatar, u.CoverPhoto} {
		if err := s.ValidateMedia(u.UserID, asset, "image"); err != nil {
			return u, err
		}
	}
	if err := s.Repo.UpdateSocialProfile(u); err != nil {
		return u, err
	}
	return s.Repo.SocialProfile(u.UserID)
}

func (s *SocialService) Suggestions(viewer string, limit int) ([]models.UserSuggestion, error) {
	if viewer == "" {
		return nil, backend.ErrUnauthorized
	}
	if limit <= 0 {
		limit = 5
	}
	if limit > 30 {
		limit = 30
	}
	return s.Repo.Suggestions(viewer, limit)
}

func (s *SocialService) ValidateTarget(actor, target string) error {
	if actor == target || target == "" {
		return backend.ErrBadRequest
	}
	return s.Repo.DoesUserExists(target)
}

func (s *SocialService) CanMessage(actor, target string) error {
	if err := s.ValidateTarget(actor, target); err != nil {
		return err
	}
	allowed, err := s.Repo.CanMessage(actor, target)
	if err != nil {
		return err
	}
	if !allowed {
		return backend.ErrForbidden
	}
	return nil
}

func (s *SocialService) Follow(actor, target string) (string, error) {
	if err := s.ValidateTarget(actor, target); err != nil {
		return "", err
	}
	return s.Repo.FollowUser(actor, target)
}

func (s *SocialService) Unfollow(actor, target string) error {
	if err := s.ValidateTarget(actor, target); err != nil {
		return err
	}
	return s.Repo.UnfollowUser(actor, target)
}

func (s *SocialService) FollowRequests(recipient string, offset int) ([]models.FollowRequest, error) {
	if offset < 0 {
		return nil, backend.ErrBadRequest
	}
	return s.Repo.FollowRequests(recipient, offset)
}

func (s *SocialService) DecideFollowRequest(recipient, requester string, accept bool) error {
	if err := s.ValidateTarget(recipient, requester); err != nil {
		return err
	}
	return s.Repo.DecideFollowRequest(recipient, requester, accept)
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

func (s *SocialService) ViewStory(storyID int, viewerID string) error {
	if storyID < 1 || viewerID == "" {
		return backend.ErrBadRequest
	}
	return s.Repo.MarkStoryViewed(storyID, viewerID)
}

func (s *SocialService) StoryViewers(storyID int, requesterID string) ([]models.StoryViewer, error) {
	if storyID < 1 || requesterID == "" {
		return nil, backend.ErrBadRequest
	}
	return s.Repo.StoryViewers(storyID, requesterID)
}

func (s *SocialService) ReplyToStory(storyID int, replierID, content string) (int, error) {
	content = strings.TrimSpace(content)
	if storyID < 1 || replierID == "" || content == "" || utf8.RuneCountInString(content) > 1000 {
		return 0, backend.ErrBadRequest
	}
	owner, err := s.Repo.LiveStoryOwner(storyID)
	if err != nil {
		return 0, err
	}
	if owner == replierID {
		return 0, backend.ErrBadRequest
	}
	if err := s.CanMessage(replierID, owner); err != nil {
		return 0, err
	}
	return s.Repo.AddStoryReply(storyID, replierID, content)
}

func (s *SocialService) StoryReplies(storyID int, requesterID string) ([]models.StoryReply, error) {
	if storyID < 1 || requesterID == "" {
		return nil, backend.ErrBadRequest
	}
	return s.Repo.StoryReplies(storyID, requesterID)
}

func (s *SocialService) ArchivedStories(offset int, userID string) ([]models.Story, error) {
	if offset < 0 || userID == "" {
		return nil, backend.ErrBadRequest
	}
	return s.Repo.ArchivedStories(offset, userID)
}
