package repositories

import (
	realtimeforum "social-network/backend"
	"social-network/backend/pkg/models"
)

func (db *DB) PostInsights(postID int) (models.PostInsights, error) {
	var insights models.PostInsights
	var privacy string
	var authorPublic bool
	err := db.Conn.QueryRow(
		`SELECT p.userId, p.privacy, u.isPublic, p.commentsCounter
		 FROM post p JOIN user u ON u.userId = p.userId
		 WHERE p.postId = ?`, postID,
	).Scan(&insights.AuthorId, &privacy, &authorPublic, &insights.Comments)
	if err != nil {
		return models.PostInsights{}, realtimeforum.ErrNotFound
	}

	switch {
	case privacy == "selected":
		insights.Audience = "selected"
		err = db.Conn.QueryRow("SELECT COUNT(*) FROM post_selected_follower WHERE postId = ?", postID).Scan(&insights.Reach)
	case privacy == "public" && authorPublic:
		insights.Audience = "everyone"
		err = db.Conn.QueryRow("SELECT COUNT(*) FROM user").Scan(&insights.Reach)
	default:
		insights.Audience = "followers"
		err = db.Conn.QueryRow("SELECT COUNT(*) FROM follow WHERE followedId = ?", insights.AuthorId).Scan(&insights.Reach)
	}
	if err != nil {
		return models.PostInsights{}, err
	}

	if err = db.Conn.QueryRow(
		`SELECT COUNT(*),
		        COALESCE(SUM(CASE WHEN score = 1 THEN 1 ELSE 0 END), 0),
		        COALESCE(SUM(CASE WHEN score = -1 THEN 1 ELSE 0 END), 0)
		 FROM reaction WHERE entityType = 'post' AND entityId = ?`, postID,
	).Scan(&insights.Reactions, &insights.Up, &insights.Down); err != nil {
		return models.PostInsights{}, err
	}

	rows, err := db.Conn.Query(
		`SELECT date(createdAt), COUNT(*),
		        SUM(CASE WHEN score = 1 THEN 1 ELSE 0 END),
		        SUM(CASE WHEN score = -1 THEN 1 ELSE 0 END)
		 FROM reaction WHERE entityType = 'post' AND entityId = ?
		 GROUP BY date(createdAt) ORDER BY date(createdAt)`, postID,
	)
	if err != nil {
		return models.PostInsights{}, err
	}
	defer rows.Close()
	insights.Days = []models.ReactionDay{}
	for rows.Next() {
		var day models.ReactionDay
		if err := rows.Scan(&day.Day, &day.Total, &day.Up, &day.Down); err != nil {
			return models.PostInsights{}, err
		}
		insights.Days = append(insights.Days, day)
	}
	return insights, rows.Err()
}
