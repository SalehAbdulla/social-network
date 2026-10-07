package service

import (
	"fmt"
	"log/slog"
	realtimeforum "social-network/backend"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	db "social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/user"

	"github.com/google/uuid"
)

type AuthService interface {
	Register(inputs user.RegisterRequestDTO) (RegisteredUser, error)
	Login(identifier, password string) (string, string, error)
	Logout(token string) error
	GetMe(userID string) (user.UserDTO, error)
	NicknameAvailable(nickname string) (bool, error)
	ChangePassword(userID, currentPassword, newPassword string) (string, error)
	UserIDByEmail(email string) (string, error)
	// SavedAccounts resolves the browser's saved-account tokens to the accounts
	// they still stand for, for the switch-accounts view.
	SavedAccounts(tokens []string) ([]SavedAccountSession, error)
	// TokenForUser finds the saved token that still stands for one account, which
	// is what performs a passwordless switch.
	TokenForUser(tokens []string, userID string) (string, bool)
}

// RegisteredUser is the account a signup created, including the handle the
// service generated when the form left the nickname blank.
type RegisteredUser struct {
	UserID   string
	Nickname string
	Token    string
}

// SavedAccountSession pairs an account a browser saved with the session token
// that makes switching to it possible. The token is intentionally not part of
// the account view: handlers keep it server-side and answer with the account
// alone, so a saved browser never exposes another account's credential to the
// page.
type SavedAccountSession struct {
	Token string
	models.SavedAccount
}

// Longest generated handle, leaving room for the numeric suffix inside the
// 2-33 character nickname rule.
const maxGeneratedNickname = 30

type AuthServiceImpl struct {
	db             db.AuthRepository
	sessionManager *SessionManager
}

func NewAuthService(database db.AuthRepository) AuthService {
	return AuthServiceImpl{
		db:             database,
		sessionManager: DefaultSessionManager,
	}
}

func (s AuthServiceImpl) Register(req user.RegisterRequestDTO) (RegisteredUser, error) {
	if err := s.db.DoesEmailExists(req.Email); err != nil {
		return RegisteredUser{}, err
	}

	// A blank nickname is generated instead of rejected: the field is optional
	// in the signup form, but user.nickName is NOT NULL UNIQUE.
	nickname := req.Nickname
	if nickname == "" {
		generated, err := s.availableNickname(req.FirstName, req.LastName, req.Email)
		if err != nil {
			return RegisteredUser{}, err
		}
		nickname = generated
	} else if err := s.db.DoesNicknameExists(nickname); err != nil {
		return RegisteredUser{}, err
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		slog.Error("failed to hash password", "error", err)
		return RegisteredUser{}, realtimeforum.ErrInternal
	}

	birthDate, _ := time.Parse("2006-01-02", req.BirthDate)
	yearOfBirth := birthDate.Year()

	userID := uuid.NewString()
	if err := s.db.InsertUser(models.Registration{
		UserID:       userID,
		Nickname:     nickname,
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		Email:        req.Email,
		PasswordHash: string(hashedPassword),
		BirthDate:    req.BirthDate,
		BirthYear:    yearOfBirth,
		Gender:       req.Gender,
		Bio:          req.Bio,
		IsPublic:     req.IsPublic,
	}); err != nil {
		return RegisteredUser{}, err
	}

	token := uuid.NewString()
	if err := s.sessionManager.CreateSession(userID, token); err != nil {
		slog.Error("failed to persist session", "user_id", userID, "error", err)
		return RegisteredUser{}, realtimeforum.ErrInternal
	}

	return RegisteredUser{UserID: userID, Nickname: nickname, Token: token}, nil
}

// sanitizeHandle keeps only the characters the nickname rule allows.
func sanitizeHandle(value string) string {
	var handle strings.Builder
	for _, r := range strings.ToLower(value) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			handle.WriteRune(r)
		}
	}
	return handle.String()
}

// nicknameSeed is the base handle a blank nickname falls back to: the name when
// enough of it survives, then the email local part, then a plain fallback. It
// always satisfies the two-character minimum.
func nicknameSeed(firstName, lastName, email string) string {
	seed := sanitizeHandle(firstName + lastName)
	if len(seed) < 2 {
		local, _, _ := strings.Cut(email, "@")
		seed = sanitizeHandle(local)
	}
	if len(seed) < 2 {
		seed = "user"
	}
	if len(seed) > maxGeneratedNickname {
		seed = seed[:maxGeneratedNickname]
	}
	return seed
}

// availableNickname appends a counter until the handle is free, so two new
// members with the same name both get one.
func (s AuthServiceImpl) availableNickname(firstName, lastName, email string) (string, error) {
	seed := nicknameSeed(firstName, lastName, email)
	for attempt := 1; attempt <= 20; attempt++ {
		candidate := seed
		if attempt > 1 {
			candidate = fmt.Sprintf("%s%d", seed, attempt)
		}
		available, err := s.db.NicknameAvailable(candidate)
		if err != nil {
			return "", err
		}
		if available {
			return candidate, nil
		}
	}
	return "", realtimeforum.ErrInternal
}

func (s AuthServiceImpl) NicknameAvailable(nickname string) (bool, error) {
	nickname, err := user.ValidateNickname(nickname)
	if err != nil {
		return false, realtimeforum.ErrBadRequest
	}
	return s.db.NicknameAvailable(nickname)
}

func (s AuthServiceImpl) Login(identifier, password string) (string, string, error) {
	userID, hashedPassword, err := s.db.GetUserCredentials(identifier)
	if err != nil {
		slog.Info("login credential lookup failed", "identifier", identifier, "error", err)
		return "", "", err
	}

	err = bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
	if err != nil {
		slog.Info("invalid password attempt", "user_id", userID)
		return "", "", realtimeforum.ErrInvalidCredentials
	}

	token := uuid.NewString()
	if err := s.sessionManager.CreateSession(userID, token); err != nil {
		slog.Error("failed to persist session", "user_id", userID, "error", err)
		return "", "", realtimeforum.ErrInternal
	}

	return userID, token, nil
}

func (s AuthServiceImpl) Logout(token string) error {
	s.sessionManager.DeleteSession(token)
	return nil
}

// SavedAccounts resolves saved tokens to the accounts they still stand for. A
// token whose session was revoked or has expired is dropped, and an account
// reached by more than one token — which happens when the same account is signed
// into twice, since that revokes the older session — is kept once, at its newest
// token, because callers prepend the latest login. The order is the caller's
// list order.
func (s AuthServiceImpl) SavedAccounts(tokens []string) ([]SavedAccountSession, error) {
	order := make([]string, 0, len(tokens))
	tokenByUser := make(map[string]string, len(tokens))
	seen := make(map[string]bool, len(tokens))
	for _, token := range tokens {
		userID, ok := s.sessionManager.GetUserIdByToken(token)
		if !ok || userID == "" || seen[userID] {
			continue
		}
		seen[userID] = true
		order = append(order, userID)
		tokenByUser[userID] = token
	}
	if len(order) == 0 {
		return nil, nil
	}

	summaries, err := s.db.AccountsForUsers(order)
	if err != nil {
		return nil, err
	}

	accounts := make([]SavedAccountSession, 0, len(order))
	for _, userID := range order {
		summary, ok := summaries[userID]
		if !ok {
			// The user row is gone; drop the token rather than draw an empty row.
			continue
		}
		accounts = append(accounts, SavedAccountSession{Token: tokenByUser[userID], SavedAccount: summary})
	}
	return accounts, nil
}

// TokenForUser finds the saved token that still stands for one account. The
// second result is false when the account is not among the saved tokens or its
// session has expired, which the caller answers as "not found".
func (s AuthServiceImpl) TokenForUser(tokens []string, userID string) (string, bool) {
	for _, token := range tokens {
		if resolved, ok := s.sessionManager.GetUserIdByToken(token); ok && resolved == userID {
			return token, true
		}
	}
	return "", false
}

// ChangePassword verifies the current credential, stores the replacement and
// rotates the session, returning the token the caller's browser should now use.
// The rotation is the part that matters: SaveSession deletes every other session
// row of this user in the same transaction that inserts the new one, so a stolen
// cookie stops working the moment the owner changes their password. The session
// that made the change keeps working because it receives the new token.
//
// If the session write fails after the hash was stored, the password has changed
// and the caller is told so: the old token stays valid until it expires, which
// is why that path is logged as an error rather than swallowed.
func (s AuthServiceImpl) ChangePassword(userID, currentPassword, newPassword string) (string, error) {
	currentHash, err := s.db.PasswordHash(userID)
	if err != nil {
		return "", err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(currentPassword)); err != nil {
		slog.Info("password change rejected", "user_id", userID)
		return "", realtimeforum.ErrWrongPassword
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		slog.Error("failed to hash password", "user_id", userID, "error", err)
		return "", realtimeforum.ErrInternal
	}
	if err := s.db.UpdatePassword(userID, string(hashedPassword)); err != nil {
		return "", err
	}

	token := uuid.NewString()
	if err := s.sessionManager.CreateSession(userID, token); err != nil {
		slog.Error("failed to rotate the session after a password change", "user_id", userID, "error", err)
		return "", realtimeforum.ErrInternal
	}
	return token, nil
}

// UserIDByEmail is the lookup the reset flow needs; it lives here so handlers
// keep talking to one auth surface rather than reaching for the database.
func (s AuthServiceImpl) UserIDByEmail(email string) (string, error) {
	return s.db.UserIDByEmail(email)
}

func (s AuthServiceImpl) GetMe(userID string) (user.UserDTO, error) {
	profile, err := s.db.GetUserProfile(userID)
	if err != nil {
		return user.UserDTO{}, err
	}

	return user.UserDTO{
		UserID:    profile.UserID,
		Nickname:  profile.Nickname,
		FirstName: profile.FirstName,
		LastName:  profile.LastName,
		Email:     profile.Email,
		BirthDate: profile.BirthDate,
	}, nil
}
