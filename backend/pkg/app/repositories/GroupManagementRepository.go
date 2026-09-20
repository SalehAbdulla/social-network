package repositories

import (
	"database/sql"
	backend "social-network/backend"
	"social-network/backend/pkg/models"
)

func (db *DB) TransferGroup(id int, owner, target string) error {
	tx, err := db.Conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var exists bool
	if err = tx.QueryRow("SELECT EXISTS(SELECT 1 FROM socialGroupMember WHERE groupId=? AND userId=?)", id, target).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return backend.ErrNotFound
	}
	result, err := tx.Exec("UPDATE socialGroup SET ownerId=? WHERE groupId=? AND ownerId=?", target, id, owner)
	if err != nil {
		return err
	}
	count, _ := result.RowsAffected()
	if count != 1 {
		return backend.ErrForbidden
	}
	if _, err = tx.Exec("UPDATE socialGroupMember SET role=CASE WHEN userId=? THEN 'owner' ELSE 'member' END WHERE groupId=?", target, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (db *DB) EditableGroupContent(groupID, id int, kind, userID string, owner bool) (models.GroupContent, error) {
	var item models.GroupContent
	err := db.Conn.QueryRow("SELECT id,userId,mediaUrl FROM groupContent WHERE groupId=? AND id=? AND kind=?", groupID, id, kind).Scan(&item.ID, &item.UserID, &item.MediaURL)
	if err == sql.ErrNoRows {
		return item, backend.ErrNotFound
	}
	if err != nil {
		return item, err
	}
	if item.UserID != userID && !owner {
		return item, backend.ErrForbidden
	}
	return item, nil
}
