package repositories

import (
	"database/sql"
	"errors"
	"time"

	realtimeforum "social-network/backend"
	"social-network/backend/pkg/models"
)

const sqliteTimeLayout = "2006-01-02 15:04:05"

func formatSQLiteTime(t time.Time) string { return t.UTC().Format(sqliteTimeLayout) }

func parseSQLiteTime(value string) (time.Time, error) {
	for _, layout := range []string{sqliteTimeLayout, time.RFC3339} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed.UTC(), nil
		}
	}
	return time.Time{}, realtimeforum.ErrInternal
}

func (db *DB) SaveSession(token, userID string, createdAt, expiresAt time.Time) error {
	tx, err := db.Conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec("DELETE FROM session WHERE userId = ?", userID); err != nil {
		return err
	}
	if _, err = tx.Exec(
		"INSERT INTO session (token, userId, expiresAt, createdAt, lastSeenAt) VALUES (?, ?, ?, ?, ?)",
		token, userID, formatSQLiteTime(expiresAt), formatSQLiteTime(createdAt), formatSQLiteTime(createdAt),
	); err != nil {
		return err
	}
	return tx.Commit()
}

func (db *DB) SessionByToken(token string) (models.Session, error) {
	session := models.Session{Token: token}
	var createdAt, lastSeenAt, expiresAt string
	err := db.Conn.QueryRow(
		"SELECT userId, createdAt, lastSeenAt, expiresAt FROM session WHERE token = ?", token,
	).Scan(&session.UserID, &createdAt, &lastSeenAt, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return models.Session{}, realtimeforum.ErrNotFound
	}
	if err != nil {
		return models.Session{}, realtimeforum.ErrInternal
	}
	if session.CreatedAt, err = parseSQLiteTime(createdAt); err != nil {
		return models.Session{}, err
	}
	if session.LastSeenAt, err = parseSQLiteTime(lastSeenAt); err != nil {
		return models.Session{}, err
	}
	if session.ExpiresAt, err = parseSQLiteTime(expiresAt); err != nil {
		return models.Session{}, err
	}
	return session, nil
}

func (db *DB) TouchSession(token string, lastSeenAt, expiresAt time.Time) error {
	_, err := db.Conn.Exec(
		"UPDATE session SET lastSeenAt = ?, expiresAt = ? WHERE token = ?",
		formatSQLiteTime(lastSeenAt), formatSQLiteTime(expiresAt), token,
	)
	return err
}

func (db *DB) DeleteSessionRow(token string) error {
	_, err := db.Conn.Exec("DELETE FROM session WHERE token = ?", token)
	return err
}

func (db *DB) DeleteSessionsForUser(userID string) (int64, error) {
	result, err := db.Conn.Exec("DELETE FROM session WHERE userId = ?", userID)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (db *DB) DeleteStaleSessions(now, absoluteCutoff, idleCutoff time.Time) (int64, error) {
	result, err := db.Conn.Exec(
		"DELETE FROM session WHERE expiresAt <= ? OR createdAt <= ? OR lastSeenAt <= ?",
		formatSQLiteTime(now), formatSQLiteTime(absoluteCutoff), formatSQLiteTime(idleCutoff),
	)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
