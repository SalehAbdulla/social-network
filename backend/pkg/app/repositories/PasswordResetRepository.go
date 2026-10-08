package repositories

import (
	"database/sql"
	"errors"
	"time"

	realtimeforum "social-network/backend"
)

type PasswordReset struct {
	ResetID   string
	UserID    string
	ExpiresAt time.Time
	UsedAt    sql.NullTime
}

func (db *DB) SavePasswordReset(resetID, userID, tokenHash string, expiresAt, createdAt time.Time) error {
	tx, err := db.Conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec("DELETE FROM passwordReset WHERE userId = ?", userID); err != nil {
		return err
	}
	if _, err = tx.Exec(
		"INSERT INTO passwordReset (resetId, userId, tokenHash, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)",
		resetID, userID, tokenHash, formatSQLiteTime(expiresAt), formatSQLiteTime(createdAt),
	); err != nil {
		return err
	}
	return tx.Commit()
}

func (db *DB) PasswordResetByHash(tokenHash string) (PasswordReset, error) {
	reset := PasswordReset{}
	var expiresAt string
	var usedAt sql.NullString
	err := db.Conn.QueryRow(
		"SELECT resetId, userId, expiresAt, usedAt FROM passwordReset WHERE tokenHash = ?", tokenHash,
	).Scan(&reset.ResetID, &reset.UserID, &expiresAt, &usedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return PasswordReset{}, realtimeforum.ErrNotFound
	}
	if err != nil {
		return PasswordReset{}, realtimeforum.ErrInternal
	}
	if reset.ExpiresAt, err = parseSQLiteTime(expiresAt); err != nil {
		return PasswordReset{}, err
	}
	if usedAt.Valid {
		parsed, err := parseSQLiteTime(usedAt.String)
		if err != nil {
			return PasswordReset{}, err
		}
		reset.UsedAt = sql.NullTime{Time: parsed, Valid: true}
	}
	return reset, nil
}

func (db *DB) ConsumePasswordReset(tokenHash string, now time.Time) (bool, error) {
	result, err := db.Conn.Exec(
		"UPDATE passwordReset SET usedAt = ? WHERE tokenHash = ? AND usedAt IS NULL AND expiresAt > ?",
		formatSQLiteTime(now), tokenHash, formatSQLiteTime(now),
	)
	if err != nil {
		return false, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return affected == 1, nil
}

func (db *DB) DeletePasswordResetsForUser(userID string) error {
	_, err := db.Conn.Exec("DELETE FROM passwordReset WHERE userId = ?", userID)
	return err
}

func (db *DB) DeleteExpiredPasswordResets(now time.Time) (int64, error) {
	result, err := db.Conn.Exec("DELETE FROM passwordReset WHERE expiresAt <= ?", formatSQLiteTime(now))
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
