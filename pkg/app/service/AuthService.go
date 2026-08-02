package service

import (
	"log/slog"
	realtimeforum "real-time-forum"
	"strconv"
	"time"

	"golang.org/x/crypto/bcrypt"

	"real-time-forum/pkg/payload/user"
	db "real-time-forum/pkg/app/repositories"

	"github.com/google/uuid"
)

type AuthService interface {
	Register(inputs user.RegisterRequestDTO) (string, string, error)
	Login(identifier, password string) (string, string, error)
	Logout(token string) error
	GetMe(userID string) (user.UserDTO, error)
}

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

func (s AuthServiceImpl) Register(req user.RegisterRequestDTO) (string, string, error) {
	if err := s.db.DoesEmailExists(req.Email); err != nil {
		return "", "", err
	}

	if err := s.db.DoesNicknameExists(req.Nickname); err != nil {
		return "", "", err
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		slog.Error("failed to hash password", "error", err)
		return "", "", realtimeforum.ErrInternal
	}

	age, _ := strconv.Atoi(req.Age)
	yearOfBirth := time.Now().Year() - age

	userID := uuid.NewString()
	if err := s.db.InsertUser(userID, req.Nickname, req.FirstName, req.LastName, req.Email, string(hashedPassword), yearOfBirth, req.Gender); err != nil {
		return "", "", err
	}

	token := uuid.NewString()
	s.sessionManager.CreateSession(userID, token)

	return userID, token, nil
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
	s.sessionManager.CreateSession(userID, token)

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
	}, nil
}
