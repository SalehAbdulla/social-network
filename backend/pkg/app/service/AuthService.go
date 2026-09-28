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
}

// RegisteredUser is the account a signup created, including the handle the
// service generated when the form left the nickname blank.
type RegisteredUser struct {
	UserID   string
	Nickname string
	Token    string
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
