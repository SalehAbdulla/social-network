package repositories

import (
	"database/sql"
	realtimeforum "social-network/backend"
	"social-network/backend/pkg/models"
)

type ReactionRepository interface {
	UpsertReaction(userId string, entityType string, entityId int, score int) (int, error)
	GetUserScore(userId string, entityType string, entityId int) (int, error)
}

// reactionTarget checks that the viewer may read what they are reacting to.
// Existence alone is not enough: reacting to a post you cannot open would leak
// its score and turn the endpoint into an existence oracle. An unreadable target
// answers not found, exactly like PostRepository.GetPostByID, so the answer says
// nothing about whether the row exists.
func (db *DB) reactionTarget(userId, entityType string, entityId int) error {
	switch entityType {
	case "post":
		allowed, err := db.CanViewPost(entityId, userId)
		if err != nil {
			return realtimeforum.ErrInternal
		}
		if !allowed {
			return realtimeforum.ErrNotFound
		}
		return nil
	case "comment":
		allowed, err := db.CanViewComment(entityId, userId)
		if err != nil {
			return realtimeforum.ErrInternal
		}
		if !allowed {
			return realtimeforum.ErrNotFound
		}
		return nil
	default:
		return realtimeforum.ErrBadRequest
	}
}

func (db *DB) UpsertReaction(userId string, entityType string, entityId int, score int) (int, error) {
	if err := db.reactionTarget(userId, entityType, entityId); err != nil {
		return 0, err
	}

	var existingReaction models.Reaction
	err := db.Conn.QueryRow(
		`SELECT reactionId, userId, entityType, entityId, score, createdAt
		 FROM reaction
		 WHERE userId = ? AND entityType = ? AND entityId = ?`,
		userId, entityType, entityId,
	).Scan(
		&existingReaction.ReactionId,
		&existingReaction.UserId,
		&existingReaction.EntityType,
		&existingReaction.EntityId,
		&existingReaction.Score,
		&existingReaction.CreatedAt,
	)

	if err == sql.ErrNoRows {
		_, err := db.Conn.Exec(
			`INSERT INTO reaction (userId, entityType, entityId, score, createdAt)
			 VALUES (?, ?, ?, ?, datetime('now'))`,
			userId, entityType, entityId, score,
		)
		if err != nil {
			return 0, realtimeforum.ErrInternal
		}
	} else if err != nil {
		return 0, realtimeforum.ErrInternal
	} else {
		if existingReaction.Score == score {
			_, err := db.Conn.Exec(
				`DELETE FROM reaction WHERE reactionId = ?`,
				existingReaction.ReactionId,
			)
			if err != nil {
				return 0, realtimeforum.ErrInternal
			}
			score = 0
		} else {
			_, err := db.Conn.Exec(
				`UPDATE reaction SET score = ?, createdAt = datetime('now') WHERE reactionId = ?`,
				score, existingReaction.ReactionId,
			)
			if err != nil {
				return 0, realtimeforum.ErrInternal
			}
		}
	}

	var totalScore int
	err = db.Conn.QueryRow(
		`SELECT COALESCE(SUM(score), 0) FROM reaction WHERE entityType = ? AND entityId = ?`,
		entityType, entityId,
	).Scan(&totalScore)
	if err != nil {
		return 0, realtimeforum.ErrInternal
	}

	switch entityType {
	case "post":
		_, err = db.Conn.Exec(
			`UPDATE post SET score = ? WHERE postId = ?`,
			totalScore, entityId,
		)
	case "comment":
		_, err = db.Conn.Exec(
			`UPDATE comment SET score = ? WHERE commentId = ?`,
			totalScore, entityId,
		)
	}
	if err != nil {
		return 0, realtimeforum.ErrInternal
	}

	return totalScore, nil
}

func (db *DB) GetUserScore(userId string, entityType string, entityId int) (int, error) {
	var score sql.NullInt64
	err := db.Conn.QueryRow(
		`SELECT score FROM reaction WHERE userId = ? AND entityType = ? AND entityId = ?`,
		userId, entityType, entityId,
	).Scan(&score)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	if score.Valid {
		return int(score.Int64), nil
	}
	return 0, nil
}
