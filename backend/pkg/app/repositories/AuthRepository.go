package repositories

import (
	"database/sql"
	"errors"
	"log/slog"
	realtimeforum "social-network/backend"
	"social-network/backend/pkg/models"
)

type AuthRepository interface {
	DoesEmailExists(email string) error
	DoesNicknameExists(nickname string) error
	InsertUser(registration models.Registration) error
	NicknameAvailable(nickname string) (bool, error)
	GetUserCredentials(identifier string) (string, string, error)
	GetUserProfile(userID string) (models.UserProfile, error)
	DoesUserExists(userID string) error
	GetUserNickname(userID string) (string, error)
}

func (db *DB) DoesEmailExists(email string) error {
	var existingEmail string
	err := db.Conn.QueryRow("SELECT email FROM user WHERE email = ?", email).Scan(&existingEmail)
	if err == nil {
		return realtimeforum.ErrEmailExists
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return realtimeforum.ErrInternal
	}
	return nil
}

func (db *DB) DoesNicknameExists(nickname string) error {
	var existingNick string
	err := db.Conn.QueryRow("SELECT nickName FROM user WHERE nickName = ?", nickname).Scan(&existingNick)
	if err == nil {
		return realtimeforum.ErrNickName
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return realtimeforum.ErrInternal
	}
	return nil
}

func (db *DB) InsertUser(registration models.Registration) error {
	_, err := db.Conn.Exec(
		`INSERT INTO user (userId, nickName, firstName, lastName, email, password, birthDate, birthYear, gender, aboutMe, isPublic)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		registration.UserID, registration.Nickname, registration.FirstName, registration.LastName,
		registration.Email, registration.PasswordHash, registration.BirthDate, registration.BirthYear,
		registration.Gender, registration.Bio, registration.IsPublic,
	)
	if err != nil {
		slog.Error("failed to insert user into database",
			"email", registration.Email,
			"nickname", registration.Nickname,
			"error", err,
		)
		if nicknameErr := db.DoesNicknameExists(registration.Nickname); nicknameErr == realtimeforum.ErrNickName {
			return nicknameErr
		}
		if emailErr := db.DoesEmailExists(registration.Email); emailErr == realtimeforum.ErrEmailExists {
			return emailErr
		}
		return realtimeforum.ErrInternal
	}

	return nil
}

func (db *DB) NicknameAvailable(nickname string) (bool, error) {
	var exists int
	if err := db.Conn.QueryRow("SELECT EXISTS(SELECT 1 FROM user WHERE nickName = ?)", nickname).Scan(&exists); err != nil {
		return false, realtimeforum.ErrInternal
	}
	return exists == 0, nil
}

func (db *DB) GetUserCredentials(identifier string) (string, string, error) {
	var userID string
	var hashedPassword string

	err := db.Conn.QueryRow(
		"SELECT userId, password FROM user WHERE email = ? OR nickName = ?",
		identifier, identifier,
	).Scan(&userID, &hashedPassword)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", realtimeforum.ErrInvalidCredentials
	}
	if err != nil {
		return "", "", realtimeforum.ErrInternal
	}

	return userID, hashedPassword, nil
}

func (db *DB) GetUserProfile(userID string) (models.UserProfile, error) {
	var profile models.UserProfile

	err := db.Conn.QueryRow(
		"SELECT userId, nickName, firstName, lastName, email, birthDate FROM user WHERE userId = ?",
		userID,
	).Scan(&profile.UserID, &profile.Nickname, &profile.FirstName, &profile.LastName, &profile.Email, &profile.BirthDate)
	if errors.Is(err, sql.ErrNoRows) {
		return models.UserProfile{}, realtimeforum.ErrNotFound
	}
	if err != nil {
		return models.UserProfile{}, realtimeforum.ErrInternal
	}

	return profile, nil
}

func (db *DB) DoesUserExists(userID string) error {
	var count int
	err := db.Conn.QueryRow("SELECT COUNT(*) FROM user WHERE userId = ?", userID).Scan(&count)
	if err != nil {
		return realtimeforum.ErrInternal
	}
	if count == 0 {
		return realtimeforum.ErrNotFound
	}
	return nil
}

func (db *DB) GetUserNickname(userID string) (string, error) {
	var nickname string
	err := db.Conn.QueryRow("SELECT nickName FROM user WHERE userId = ?", userID).Scan(&nickname)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", realtimeforum.ErrNotFound
		}
		return "", realtimeforum.ErrInternal
	}
	return nickname, nil
}
