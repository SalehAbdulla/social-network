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

// CanMessage enforces the chat rule from the spec: private messages are only
// possible between two users where at least one follows the other, or when the
// recipient has a public profile.
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

// ViewStory records that a viewer opened a story, which the stories strip turns into a
// "seen" ring. There is no audience to check — a live story is readable by any signed-in
// member (see `CanViewMedia`) — so the rule this owns is the one the repository enforces:
// only a live story can be marked, and the write is idempotent.
func (s *SocialService) ViewStory(storyID int, viewerID string) error {
	if storyID < 1 || viewerID == "" {
		return backend.ErrBadRequest
	}
	return s.Repo.MarkStoryViewed(storyID, viewerID)
}

// StoryViewers answers a story's "seen by" list. The rule this owns is the repository's — it
// answers only for the story's own author, and an unknown story and someone else's are the same
// 404 — so the service only guards the shape of the arguments.
func (s *SocialService) StoryViewers(storyID int, requesterID string) ([]models.StoryViewer, error) {
	if storyID < 1 || requesterID == "" {
		return nil, backend.ErrBadRequest
	}
	return s.Repo.StoryViewers(storyID, requesterID)
}

// ReplyToStory records a reply to a live story from someone other than its author. A reply is
// private text addressed to the author alone, so the rule this owns is twofold: the story has to
// be live — an unknown or expired story is the same 404 a read gives — and the chat rule has to
// let the replier address the author (see CanMessage), so a reply cannot become a way around the
// follow rule that gates private messages. The author's own story is a 400: a reply is read by
// the author, and an author answering themselves is not a reader of it.
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

// StoryReplies answers a story's replies. The rule this owns is the repository's — it answers
// only for the story's own author, and an unknown story and someone else's are the same 404 — so
// the service only guards the shape of the arguments.
func (s *SocialService) StoryReplies(storyID int, requesterID string) ([]models.StoryReply, error) {
	if storyID < 1 || requesterID == "" {
		return nil, backend.ErrBadRequest
	}
	return s.Repo.StoryReplies(storyID, requesterID)
}

// ArchivedStories lists the caller's own expired stories. The rule this owns is the repository's
// — the list is the caller's own by construction, so there is no one else's to leak — so the
// service only guards the shape of the arguments, the way the stories listing does.
func (s *SocialService) ArchivedStories(offset int, userID string) ([]models.Story, error) {
	if offset < 0 || userID == "" {
		return nil, backend.ErrBadRequest
	}
	return s.Repo.ArchivedStories(offset, userID)
}
