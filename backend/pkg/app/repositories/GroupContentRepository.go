package repositories

import (
	"database/sql"
	backend "social-network/backend"
	"social-network/backend/pkg/models"
	"time"
)

func (db *DB) GroupContentExists(groupID, id int, kind string) error {
	var found int
	err := db.Conn.QueryRow("SELECT id FROM groupContent WHERE groupId=? AND id=? AND kind=?", groupID, id, kind).Scan(&found)
	if err == sql.ErrNoRows {
		return backend.ErrNotFound
	}
	return err
}

// CanViewGroupContent reports whether one account may read — and therefore react to — one
// row of group content. Membership of the owning group is the whole rule, exactly as it is
// for reading the tab: a non-member, a row that does not exist and a row of the wrong kind
// all get `false`, so the answer cannot be used to probe for rows the caller cannot see.
//
// `kind` is the content's own kind ('posts' or 'comments'), not the reaction's target type;
// the caller decides which one it means.
func (db *DB) CanViewGroupContent(contentID int, userID, kind string) (bool, error) {
	var allowed bool
	err := db.Conn.QueryRow(`SELECT EXISTS(
 SELECT 1 FROM groupContent c
 JOIN socialGroupMember m ON m.groupId = c.groupId AND m.userId = ?
 WHERE c.id = ? AND c.kind = ?)`, userID, contentID, kind).Scan(&allowed)
	if err != nil {
		return false, err
	}
	return allowed, nil
}

func (db *DB) ListGroupContent(groupID int, userID, kind string, parentID, offset int) ([]models.GroupContent, error) {
	// Events are ordered by when they happen rather than when they were created:
	// upcoming first, soonest first, then the past most recent first, which is the
	// order the events tab splits into two sections. The comparison goes through
	// SQLite's datetime() because startsAt is stored as RFC3339
	// ("2026-09-29T18:00:00Z") and comparing that to datetime('now') as a raw
	// string would misjudge any event later the same day — 'T' sorts after ' '.
	// Every other kind stays newest-first, and the id is always the last key so
	// paging has a total order. The clause is chosen here from constants and never
	// built from the request.
	order := "c.id DESC"
	if kind == "events" {
		order = "datetime(c.startsAt) >= datetime('now') DESC, CASE WHEN datetime(c.startsAt) >= datetime('now') THEN datetime(c.startsAt) END ASC, datetime(c.startsAt) DESC, c.id DESC"
	}
	rows, err := db.Conn.Query(`SELECT c.id,c.groupId,c.userId,u.nickName,u.firstName,u.lastName,c.kind,COALESCE(c.parentId,0),c.title,c.content,c.mediaUrl,c.startsAt,c.createdAt,c.score,
 COALESCE((SELECT status FROM groupRSVP WHERE eventId=c.id AND userId=?),''),
 (SELECT COUNT(*) FROM groupRSVP WHERE eventId=c.id AND status='going'),
 (SELECT COUNT(*) FROM groupRSVP WHERE eventId=c.id AND status='not_going'),
 (c.kind='events' AND datetime(c.startsAt) >= datetime('now')),
 CASE WHEN c.kind IN ('posts','comments') THEN EXISTS(
  SELECT 1 FROM reaction r WHERE r.userId=? AND r.entityId=c.id
   AND r.entityType = CASE c.kind WHEN 'posts' THEN 'group_post' ELSE 'group_comment' END
 ) ELSE 0 END
 FROM groupContent c JOIN user u ON u.userId=c.userId WHERE c.groupId=? AND (c.kind=? OR (?='timeline' AND c.kind IN ('messages','events')) OR (?='media' AND c.mediaUrl<>'')) AND (?='media' OR COALESCE(c.parentId,0)=?) ORDER BY `+order+` LIMIT 31 OFFSET ?`, userID, userID, groupID, kind, kind, kind, kind, parentID, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []models.GroupContent{}
	for rows.Next() {
		var c models.GroupContent
		// The boolean expressions come back as 0 or 1, which is read as an int so
		// the driver's conversion rules are not part of the contract.
		var upcoming, likedByMe int
		if err = rows.Scan(&c.ID, &c.GroupID, &c.UserID, &c.Nickname, &c.FirstName, &c.LastName, &c.Kind, &c.ParentID, &c.Title, &c.Content, &c.MediaURL, &c.StartsAt, &c.CreatedAt, &c.LikeCount, &c.RSVP, &c.Going, &c.NotGoing, &upcoming, &likedByMe); err != nil {
			return nil, err
		}
		c.Upcoming = upcoming != 0
		c.LikedByMe = likedByMe != 0
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

// GroupEvent is the little an event reminder needs: which row to stamp, which
// group the notification should point at, and who is speaking for it.
type GroupEvent struct {
	ID       int
	GroupID  int
	AuthorID string
}

// EventsStartingWithin finds the events that begin inside the window and have
// not been reminded about yet. Both comparisons go through datetime() for the
// reason ListGroupContent explains: startsAt is RFC3339, and SQLite's datetime()
// is what makes it comparable with datetime('now') and with the timestamps this
// package writes.
func (db *DB) EventsStartingWithin(from, until time.Time) ([]GroupEvent, error) {
	rows, err := db.Conn.Query(`SELECT id,groupId,userId FROM groupContent
		WHERE kind='events' AND reminderSentAt='' AND datetime(startsAt) >= datetime(?) AND datetime(startsAt) <= datetime(?)
		ORDER BY datetime(startsAt), id`, formatSQLiteTime(from), formatSQLiteTime(until))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []GroupEvent{}
	for rows.Next() {
		var event GroupEvent
		if err := rows.Scan(&event.ID, &event.GroupID, &event.AuthorID); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

// EventAttendees lists the members who said they are going. The author is not
// filtered out here: the caller decides, so "who is coming" stays a plain
// question about the RSVP rows.
func (db *DB) EventAttendees(eventID int) ([]string, error) {
	rows, err := db.Conn.Query("SELECT userId FROM groupRSVP WHERE eventId=? AND status='going'", eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	attendees := []string{}
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return nil, err
		}
		attendees = append(attendees, userID)
	}
	return attendees, rows.Err()
}

// MarkEventReminded stamps the event so a later sweep does not remind twice. It
// only stamps a row that is still unstamped, so two sweeps racing each other
// cannot both claim the same event.
func (db *DB) MarkEventReminded(eventID int) (bool, error) {
	result, err := db.Conn.Exec("UPDATE groupContent SET reminderSentAt=datetime('now') WHERE id=? AND reminderSentAt=''", eventID)
	if err != nil {
		return false, err
	}
	claimed, err := result.RowsAffected()
	return claimed > 0, err
}
