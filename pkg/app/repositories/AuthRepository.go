package repositories

import (
	"database/sql"
	"errors"
	"log/slog"
	realtimeforum "real-time-forum"
	"real-time-forum/pkg/models"
)

type AuthRepository interface {
	DoesEmailExists(email string) error
	DoesNicknameExists(nickname string) error
	InsertUser(userID, nickName, firstName, lastName, email, hashedPassword string, yearOfBirth int, gender string) error
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

func (db *DB) InsertUser(userID, nickName, firstName, lastName, email, hashedPassword string, yearOfBirth int, gender string) error {
	_, err := db.Conn.Exec(
		`INSERT INTO user (userId, nickName, firstName, lastName, email, hashedPassword, yearOfBirth, gender)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		userID, nickName, firstName, lastName, email, hashedPassword, yearOfBirth, gender,
	)
	if err != nil {
		slog.Error("failed to insert user into database",
			"email", email,
			"nickname", nickName,
			"error", err,
		)
		return realtimeforum.ErrInternal
	}

	return nil
}

func (db *DB) GetUserCredentials(identifier string) (string, string, error) {
	var userID string
	var hashedPassword string

	err := db.Conn.QueryRow(
		"SELECT userId, hashedPassword FROM user WHERE email = ? OR nickName = ?",
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
		"SELECT userId, nickName, firstName, lastName, email FROM user WHERE userId = ?",
		userID,
	).Scan(&profile.UserID, &profile.Nickname, &profile.FirstName, &profile.LastName, &profile.Email)
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
