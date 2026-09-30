package repositories

import (
	"database/sql"
	"errors"
	"time"

	realtimeforum "social-network/backend"
)

// PasswordReset is one issued reset token. Only the hash is stored, so the value
// in hand is the only copy of the token that exists.
type PasswordReset struct {
	ResetID   string
	UserID    string
	ExpiresAt time.Time
	UsedAt    sql.NullTime
}

// SavePasswordReset issues one token per account: the account's older rows are
// deleted in the same transaction, so an email that arrived yesterday cannot be
// used after a newer one was requested. Keeping one live token is what makes the
// "ignore every reset mail but the last" advice true in this application.
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

// PasswordResetByHash returns the row for a token hash, spent or not, so the
// caller can tell "unknown" from "already used" instead of treating both as a
// missing row.
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

// ConsumePasswordReset claims a token exactly once. The UPDATE carries the whole
// condition — unspent and unexpired — so two confirms racing on one token cannot
// both apply a password, whichever order they reach the database in. Reporting
// `false` is a normal outcome, not an error: it means someone else won.
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

// DeletePasswordResetsForUser drops every row of one account, so a spent token
// leaves nothing behind to look up.
func (db *DB) DeletePasswordResetsForUser(userID string) error {
	_, err := db.Conn.Exec("DELETE FROM passwordReset WHERE userId = ?", userID)
	return err
}

// DeleteExpiredPasswordResets prunes rows that can no longer be claimed, spent or
// not. It runs with the session and media sweeps at startup and hourly.
func (db *DB) DeleteExpiredPasswordResets(now time.Time) (int64, error) {
	result, err := db.Conn.Exec("DELETE FROM passwordReset WHERE expiresAt <= ?", formatSQLiteTime(now))
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
