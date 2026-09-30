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
	// ResetTokenTTL is how long a reset link works: long enough to open the mail
	// on another device, short enough that a mailbox left open on a shared
	// machine is not a lasting grant.
	ResetTokenTTL = 30 * time.Minute
	// resetTokenBytes is 256 bits of entropy. That is why the stored hash is a
	// plain sha256 — unlike a password the token cannot be guessed, so there is
	// nothing for a slow hash to slow down.
	resetTokenBytes = 32
)

// PasswordResetService issues and redeems the links a forgotten password is
// recovered with. Issuing says nothing about whether the address exists, and
// redeeming says nothing about why a token was refused.
type PasswordResetService struct {
	db      *db.DB
	session *SessionManager
	mailer  Mailer
	// baseURL is the public origin the link must point at, so a mail sent from a
	// deployed instance does not carry a localhost URL.
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

// Available reports whether this server can actually deliver a link, so the
// handler can answer 503 instead of pretending it sent one.
func (s *PasswordResetService) Available() bool {
	return s != nil && s.db != nil && s.mailer != nil
}

// Describe names the delivery path, for the handler's log lines.
func (s *PasswordResetService) Describe() string {
	if s == nil || s.mailer == nil {
		return "none"
	}
	return s.mailer.Describe()
}

// RequestReset issues one link for the account and mails it. The caller has to
// answer identically whether or not this was reached: an endpoint that says "no
// such account" is a registration oracle.
func (s *PasswordResetService) RequestReset(userID, email string) error {
	token, err := newResetToken()
	if err != nil {
		slog.Error("could not generate a reset token", "error", err)
		return realtimeforum.ErrInternal
	}
	now := time.Now()
	// One live token per account: SavePasswordReset deletes the account's older
	// rows in the same transaction, so yesterday's mail stops working the moment
	// a new one is requested.
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
		// The row is already written, so a delivery failure would leave a live
		// token nobody holds. Drop it: a token that was never delivered must not
		// be a token that works.
		if cleanupErr := s.db.DeletePasswordResetsForUser(userID); cleanupErr != nil {
			slog.Error("could not discard an undelivered reset token", "user_id", userID, "error", cleanupErr)
		}
		return err
	}
	slog.Info("password reset requested", "user_id", userID, "delivery", s.mailer.Describe())
	return nil
}

// ConfirmReset redeems a token. The row is claimed before anything else happens,
// so the token is spent even if the rest fails; that is deliberate, because the
// alternative is a link that can be replayed after a transient error, and the
// recovery is simply to ask for another link.
func (s *PasswordResetService) ConfirmReset(token, password string) error {
	now := time.Now()
	hash := hashResetToken(token)

	claimed, err := s.db.ConsumePasswordReset(hash, now)
	if err != nil {
		slog.Error("could not claim a password reset token", "error", err)
		return realtimeforum.ErrInternal
	}
	if !claimed {
		// Unknown, expired or already spent: the caller is told one thing.
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

	// A reset is the "I lost control of this account" path, so nothing that was
	// signed in survives it — unlike a password change, which keeps the browser
	// that asked by handing it a rotated token. A failure here is logged and the
	// user is still told the password changed, because it did; answering 500
	// would say it had not.
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

// hashResetToken is what the table stores. A plain sha256 without a salt is the
// right tool here: the input is 256 random bits, so there is no dictionary to run
// against it, and the lookup has to be an exact match anyway.
func hashResetToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
