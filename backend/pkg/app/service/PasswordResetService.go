package service

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	realtimeforum "social-network/backend"
	db "social-network/backend/pkg/app/repositories"

	"github.com/google/uuid"
)

const (
	ResetTokenTTL   = 30 * time.Minute
	resetTokenBytes = 32
)

type PasswordResetService struct {
	db      *db.DB
	session *SessionManager
	mailer  Mailer
	baseURL string
}

func NewPasswordResetService(store *db.DB, sessions *SessionManager, mailer Mailer, baseURL string) *PasswordResetService {
	return &PasswordResetService{
		db:      store,
		session: sessions,
		mailer:  mailer,
		baseURL: strings.TrimSuffix(baseURL, "/"),
	}
}

func (s *PasswordResetService) Available() bool {
	return s != nil && s.db != nil && s.mailer != nil
}

func (s *PasswordResetService) Describe() string {
	if s == nil || s.mailer == nil {
		return "none"
	}
	return s.mailer.Describe()
}

func (s *PasswordResetService) RequestReset(userID, email string) error {
	token, err := newResetToken()
	if err != nil {
		slog.Error("could not generate a reset token", "error", err)
		return realtimeforum.ErrInternal
	}
	now := time.Now()
	if err := s.db.SavePasswordReset(uuid.NewString(), userID, hashResetToken(token), now.Add(ResetTokenTTL), now); err != nil {
		return err
	}

	link := fmt.Sprintf("%s/reset?token=%s", s.baseURL, token)
	body := strings.Join([]string{
		"Someone asked to reset the password for this address.",
		"",
		"Open this link to choose a new one:",
		link,
		"",
		fmt.Sprintf("The link works once and expires in %d minutes. If it was not you, nothing needs doing: until the link is used, nothing about the account has changed.", int(ResetTokenTTL.Minutes())),
	}, "\n")

	if err := s.mailer.Send(email, "Reset your pingup password", body); err != nil {
		if cleanupErr := s.db.DeletePasswordResetsForUser(userID); cleanupErr != nil {
			slog.Error("could not discard an undelivered reset token", "user_id", userID, "error", cleanupErr)
		}
		return err
	}
	slog.Info("password reset requested", "user_id", userID, "delivery", s.mailer.Describe())
	return nil
}

func (s *PasswordResetService) ConfirmReset(token, password string) error {
	now := time.Now()
	hash := hashResetToken(token)

	claimed, err := s.db.ConsumePasswordReset(hash, now)
	if err != nil {
		slog.Error("could not claim a password reset token", "error", err)
		return realtimeforum.ErrInternal
	}
	if !claimed {
		return realtimeforum.ErrInvalidResetToken
	}

	reset, err := s.db.PasswordResetByHash(hash)
	if err != nil {
		return err
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		slog.Error("failed to hash a reset password", "user_id", reset.UserID, "error", err)
		return realtimeforum.ErrInternal
	}
	if err := s.db.UpdatePassword(reset.UserID, string(hashed)); err != nil {
		return err
	}

	revoked, err := s.session.RevokeAllForUser(reset.UserID)
	if err != nil {
		slog.Error("password reset could not revoke the account's sessions", "user_id", reset.UserID, "error", err)
	}
	if err := s.db.DeletePasswordResetsForUser(reset.UserID); err != nil {
		slog.Error("could not clear the reset rows after a reset", "user_id", reset.UserID, "error", err)
	}
	slog.Info("password reset completed", "user_id", reset.UserID, "sessions_revoked", revoked)
	return nil
}

func newResetToken() (string, error) {
	buffer := make([]byte, resetTokenBytes)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func hashResetToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
