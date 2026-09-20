package repositories

import (
	"database/sql"
	"strings"

	backend "social-network/backend"
	"social-network/backend/pkg/models"
)

func (db *DB) CreateGroup(ownerID, title, description string, imageURL ...string) (models.Group, error) {
	tx, err := db.Conn.Begin()
	if err != nil {
		return models.Group{}, err
	}
	defer tx.Rollback()
	image := ""
	if len(imageURL) > 0 {
		image = imageURL[0]
	}
	result, err := tx.Exec("INSERT INTO socialGroup (ownerId,title,description,imageUrl) VALUES (?,?,?,?)", ownerID, title, description, image)
	if err != nil {
		return models.Group{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return models.Group{}, err
	}
	if _, err = tx.Exec("INSERT INTO socialGroupMember (groupId,userId,role) VALUES (?,?,?)", id, ownerID, "owner"); err != nil {
		return models.Group{}, err
	}
	if err = tx.Commit(); err != nil {
		return models.Group{}, err
	}
	return db.Group(int(id), ownerID)
}

func (db *DB) Groups(userID, search string, offset int, joinedOnly bool) ([]models.Group, error) {
	pattern := "%" + strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(search, "\\", "\\\\"), "%", "\\%"), "_", "\\_") + "%"
	rows, err := db.Conn.Query(`SELECT g.groupId,g.ownerId,trim(u.firstName || ' ' || u.lastName),g.title,g.description,g.imageUrl,
        (SELECT COUNT(*) FROM socialGroupMember gm WHERE gm.groupId=g.groupId),
        EXISTS(SELECT 1 FROM socialGroupMember mine WHERE mine.groupId=g.groupId AND mine.userId=?),
        EXISTS(SELECT 1 FROM socialGroupMember owner WHERE owner.groupId=g.groupId AND owner.userId=? AND owner.role='owner'),
        EXISTS(SELECT 1 FROM socialGroupRequest pending WHERE pending.groupId=g.groupId AND pending.userId=? AND pending.status='pending'),g.createdAt
        FROM socialGroup g JOIN user u ON u.userId=g.ownerId
		WHERE (g.title LIKE ? ESCAPE '\' OR g.description LIKE ? ESCAPE '\')
        AND (?=0 OR EXISTS(SELECT 1 FROM socialGroupMember joined WHERE joined.groupId=g.groupId AND joined.userId=?))
        ORDER BY g.createdAt DESC,g.groupId DESC LIMIT 31 OFFSET ?`, userID, userID, userID, pattern, pattern, joinedOnly, userID, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	groups := []models.Group{}
	for rows.Next() {
		var group models.Group
		if err := rows.Scan(&group.GroupID, &group.OwnerID, &group.OwnerName, &group.Title, &group.Description, &group.ImageURL, &group.MemberCount, &group.IsMember, &group.IsOwner, &group.JoinRequested, &group.CreatedAt); err != nil {
			return nil, err
		}
		groups = append(groups, group)
	}
	return groups, rows.Err()
}

func (db *DB) Group(groupID int, userID string) (models.Group, error) {
	var group models.Group
	err := db.Conn.QueryRow(`SELECT g.groupId,g.ownerId,trim(u.firstName || ' ' || u.lastName),g.title,g.description,g.imageUrl,
        (SELECT COUNT(*) FROM socialGroupMember gm WHERE gm.groupId=g.groupId),
        EXISTS(SELECT 1 FROM socialGroupMember mine WHERE mine.groupId=g.groupId AND mine.userId=?),
        EXISTS(SELECT 1 FROM socialGroupMember owner WHERE owner.groupId=g.groupId AND owner.userId=? AND owner.role='owner'),
        EXISTS(SELECT 1 FROM socialGroupRequest pending WHERE pending.groupId=g.groupId AND pending.userId=? AND pending.status='pending'),g.createdAt
        FROM socialGroup g JOIN user u ON u.userId=g.ownerId WHERE g.groupId=?`, userID, userID, userID, groupID).
		Scan(&group.GroupID, &group.OwnerID, &group.OwnerName, &group.Title, &group.Description, &group.ImageURL, &group.MemberCount, &group.IsMember, &group.IsOwner, &group.JoinRequested, &group.CreatedAt)
	if err == sql.ErrNoRows {
		return group, backend.ErrNotFound
	}
	return group, err
}

func (db *DB) AddGroupRequest(groupID int, userID string) error {
	tx, err := db.Conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.Exec(`INSERT INTO socialGroupRequest (groupId,userId) VALUES (?,?)
        ON CONFLICT(groupId,userId) DO UPDATE SET status='pending',createdAt=CURRENT_TIMESTAMP WHERE status<>'pending'`, groupID, userID)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count > 0 {
		if _, err = tx.Exec(`INSERT INTO notification(userId,actorId,entityType,entityId,message) SELECT ownerId,?,'group_request',groupId,'' FROM socialGroup WHERE groupId=?`, userID, groupID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (db *DB) GroupMembers(groupID int) ([]models.GroupMember, error) {
	rows, err := db.Conn.Query(`SELECT u.userId,u.nickName,u.firstName,u.lastName,COALESCE(u.avatar,''),gm.role,gm.joinedAt
        FROM socialGroupMember gm JOIN user u ON u.userId=gm.userId WHERE gm.groupId=? ORDER BY gm.role='owner' DESC,gm.joinedAt`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	members := []models.GroupMember{}
	for rows.Next() {
		var member models.GroupMember
		if err := rows.Scan(&member.UserID, &member.Nickname, &member.FirstName, &member.LastName, &member.Avatar, &member.Role, &member.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, member)
	}
	return members, rows.Err()
}

func (db *DB) GroupRequests(groupID int) ([]models.GroupRequest, error) {
	rows, err := db.Conn.Query(`SELECT r.requestId,r.groupId,r.userId,u.nickName,r.status,r.createdAt
        FROM socialGroupRequest r JOIN user u ON u.userId=r.userId WHERE r.groupId=? AND r.status='pending' ORDER BY r.createdAt`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	requests := []models.GroupRequest{}
	for rows.Next() {
		var request models.GroupRequest
		if err := rows.Scan(&request.RequestID, &request.GroupID, &request.UserID, &request.Nickname, &request.Status, &request.CreatedAt); err != nil {
			return nil, err
		}
		requests = append(requests, request)
	}
	return requests, rows.Err()
}

func (db *DB) GroupRequestDecision(groupID, requestID int, status string) error {
	tx, err := db.Conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var userID string
	err = tx.QueryRow("SELECT userId FROM socialGroupRequest WHERE requestId=? AND groupId=? AND status='pending'", requestID, groupID).Scan(&userID)
	if err == sql.ErrNoRows {
		return backend.ErrNotFound
	}
	if err != nil {
		return err
	}
	if _, err = tx.Exec("UPDATE socialGroupRequest SET status=? WHERE requestId=?", status, requestID); err != nil {
		return err
	}
	if status == "accepted" {
		if _, err = tx.Exec("INSERT OR IGNORE INTO socialGroupMember (groupId,userId) VALUES (?,?)", groupID, userID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (db *DB) AddGroupInvitation(groupID int, inviterID, inviteeID string) error {
	tx, err := db.Conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var isOwner, isMember bool
	if err := tx.QueryRow("SELECT EXISTS(SELECT 1 FROM socialGroup WHERE groupId=? AND ownerId=?)", groupID, inviterID).Scan(&isOwner); err != nil {
		return err
	}
	if !isOwner {
		if err := tx.QueryRow("SELECT EXISTS(SELECT 1 FROM socialGroupMember WHERE groupId=? AND userId=?)", groupID, inviterID).Scan(&isMember); err != nil {
			return err
		}
		if !isMember {
			return backend.ErrForbidden
		}
	}
	if inviteeID == inviterID {
		return backend.ErrBadRequest
	}
	if inviteeID == "" {
		return backend.ErrBadRequest
	}
	if err := tx.QueryRow("SELECT EXISTS(SELECT 1 FROM socialGroupMember WHERE groupId=? AND userId=?)", groupID, inviteeID).Scan(&isMember); err != nil {
		return err
	}
	if isMember {
		return backend.ErrBadRequest
	}
	result, err := tx.Exec(`INSERT INTO socialGroupInvitation (groupId,userId) VALUES (?,?)
		ON CONFLICT(groupId,userId) DO UPDATE SET status='pending',createdAt=CURRENT_TIMESTAMP WHERE status<>'pending'`, groupID, inviteeID)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count > 0 {
		if _, err = tx.Exec(`INSERT INTO notification(userId,actorId,entityType,entityId,message) VALUES(?,?,'group_invitation',?,'')`, inviteeID, inviterID, groupID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (db *DB) GroupInvitations(userID string) ([]models.GroupInvitation, error) {
	rows, err := db.Conn.Query(`SELECT i.invitationId,i.groupId,i.userId,g.title,i.status,i.createdAt
		FROM socialGroupInvitation i JOIN socialGroup g ON g.groupId=i.groupId
		WHERE i.userId=? AND i.status='pending' ORDER BY i.createdAt`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	invitations := []models.GroupInvitation{}
	for rows.Next() {
		var invitation models.GroupInvitation
		if err := rows.Scan(&invitation.InvitationID, &invitation.GroupID, &invitation.UserID, &invitation.GroupTitle, &invitation.Status, &invitation.CreatedAt); err != nil {
			return nil, err
		}
		invitations = append(invitations, invitation)
	}
	return invitations, rows.Err()
}

func (db *DB) GroupInvitationDecision(groupID, invitationID int, userID, status string) error {
	tx, err := db.Conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var inviteeID string
	err = tx.QueryRow("SELECT userId FROM socialGroupInvitation WHERE invitationId=? AND groupId=? AND status='pending'", invitationID, groupID).Scan(&inviteeID)
	if err == sql.ErrNoRows {
		return backend.ErrNotFound
	}
	if err != nil {
		return err
	}
	if inviteeID != userID {
		return backend.ErrForbidden
	}
	if _, err = tx.Exec("UPDATE socialGroupInvitation SET status=? WHERE invitationId=?", status, invitationID); err != nil {
		return err
	}
	if status == "accepted" {
		if _, err = tx.Exec("INSERT OR IGNORE INTO socialGroupMember (groupId,userId) VALUES (?,?)", groupID, userID); err != nil {
			return err
		}
	}
	return tx.Commit()
}
