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
	case "message":
		// A message is readable by exactly its two participants, so that is the whole
		// rule: anyone else is answered not found, the same as an unreadable post.
		sender, recipient, err := db.MessageParticipants(entityId)
		if err != nil {
			return realtimeforum.ErrNotFound
		}
		if userId != sender && userId != recipient {
			return realtimeforum.ErrNotFound
		}
		return nil
	case "group_post", "group_comment":
		// Group content is readable by exactly the members of the group that owns it, which
		// is also the whole rule for reacting to it. The kind is read off the target type so
		// a `group_post` cannot name a comment's id, and a row that is not the kind the
		// caller named is answered not found rather than "wrong kind" — the answer says
		// nothing about whether the row exists, exactly like the two cases above.
		kind := "posts"
		if entityType == "group_comment" {
			kind = "comments"
		}
		allowed, err := db.CanViewGroupContent(entityId, userId, kind)
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
	case "group_post", "group_comment":
		// The group keeps its total on the content row itself, which is what lets a page of
		// the Posts tab carry a like count without aggregating the reaction table per item.
		_, err = db.Conn.Exec(
			`UPDATE groupContent SET score = ? WHERE id = ?`,
			totalScore, entityId,
		)
		// A message has no denormalised column to keep: the chat list reads the total
		// from the reaction table through the (entityType, entityId) index, which is why
		// nothing here matches "message" rather than that case being forgotten.
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
