package repositories

import (
	"database/sql"
	backend "social-network/backend"
	"social-network/backend/pkg/models"
)

func (db *DB) GroupContentExists(groupID, id int, kind string) error {
	var found int
	err := db.Conn.QueryRow("SELECT id FROM groupContent WHERE groupId=? AND id=? AND kind=?", groupID, id, kind).Scan(&found)
	if err == sql.ErrNoRows {
		return backend.ErrNotFound
	}
	return err
}

func (db *DB) ListGroupContent(groupID int, userID, kind string, parentID, offset int) ([]models.GroupContent, error) {
	rows, err := db.Conn.Query(`SELECT c.id,c.groupId,c.userId,u.nickName,u.firstName,u.lastName,c.kind,COALESCE(c.parentId,0),c.title,c.content,c.mediaUrl,c.startsAt,c.createdAt,
 COALESCE((SELECT status FROM groupRSVP WHERE eventId=c.id AND userId=?),''),
 (SELECT COUNT(*) FROM groupRSVP WHERE eventId=c.id AND status='going'),
 (SELECT COUNT(*) FROM groupRSVP WHERE eventId=c.id AND status='not_going')
 FROM groupContent c JOIN user u ON u.userId=c.userId WHERE c.groupId=? AND (c.kind=? OR (?='timeline' AND c.kind IN ('messages','events')) OR (?='media' AND c.mediaUrl<>'')) AND (?='media' OR COALESCE(c.parentId,0)=?) ORDER BY c.id DESC LIMIT 31 OFFSET ?`, userID, groupID, kind, kind, kind, kind, parentID, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []models.GroupContent{}
	for rows.Next() {
		var c models.GroupContent
		if err = rows.Scan(&c.ID, &c.GroupID, &c.UserID, &c.Nickname, &c.FirstName, &c.LastName, &c.Kind, &c.ParentID, &c.Title, &c.Content, &c.MediaURL, &c.StartsAt, &c.CreatedAt, &c.RSVP, &c.Going, &c.NotGoing); err != nil {
			return nil, err
		}
		items = append(items, c)
	}
	return items, rows.Err()
}

func (db *DB) AddGroupContent(c models.GroupContent) (int, error) {
	tx, err := db.Conn.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	result, err := tx.Exec(`INSERT INTO groupContent(groupId,userId,kind,parentId,title,content,mediaUrl,startsAt) VALUES(?,?,?,NULLIF(?,0),?,?,?,?)`, c.GroupID, c.UserID, c.Kind, c.ParentID, c.Title, c.Content, c.MediaURL, c.StartsAt)
	if err != nil {
		return 0, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}
	// A new event is announced by the handler, which knows the members and can
	// push each notification as it creates it.
	return int(id), tx.Commit()
}

func (db *DB) SetGroupRSVP(eventID int, userID, status string) error {
	_, err := db.Conn.Exec(`INSERT INTO groupRSVP(eventId,userId,status) VALUES(?,?,?) ON CONFLICT(eventId,userId) DO UPDATE SET status=excluded.status`, eventID, userID, status)
	return err
}
