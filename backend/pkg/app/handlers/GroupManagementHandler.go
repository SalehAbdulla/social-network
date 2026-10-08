package handlers

import (
	"net/http"
	backend "social-network/backend"
	"strings"
	"unicode/utf8"
)

func (re *HandlerContext) ManageGroup(w http.ResponseWriter, r *http.Request) {
	id, ok := re.groupID(w, r)
	if !ok {
		return
	}
	userID := currentUser(r)
	group, err := re.GroupService.Repo.Group(id, userID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	if !group.IsOwner {
		re.HandleError(w, r, backend.ErrForbidden)
		return
	}
	if r.Method == http.MethodDelete {
		re.groupChanged(id, "deleted")
		_, err = re.GroupService.Repo.Conn.Exec("DELETE FROM socialGroup WHERE groupId=? AND ownerId=?", id, userID)
		if err != nil {
			re.HandleError(w, r, err)
			return
		}
		respond(w, 200, nil)
		return
	}
	var input struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		ImageURL    string `json:"imageUrl"`
	}
	if !re.decode(w, r, &input) {
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	if utf8.RuneCountInString(input.Title) < 3 || utf8.RuneCountInString(input.Title) > 100 || utf8.RuneCountInString(input.Description) > 1000 {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	if input.ImageURL != "" && input.ImageURL != group.ImageURL {
		if err = re.SocialService.ValidateMedia(userID, input.ImageURL, "image"); err != nil {
			re.HandleError(w, r, err)
			return
		}
	}
	_, err = re.GroupService.Repo.Conn.Exec("UPDATE socialGroup SET title=?,description=?,imageUrl=? WHERE groupId=? AND ownerId=?", input.Title, input.Description, input.ImageURL, id, userID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	group, err = re.GroupService.Repo.Group(id, userID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	re.groupChanged(id, "details")
	respond(w, 200, group)
}

func (re *HandlerContext) ManageGroupMember(w http.ResponseWriter, r *http.Request) {
	id, ok := re.groupID(w, r)
	if !ok {
		return
	}
	userID, target := currentUser(r), r.PathValue("userId")
	group, err := re.GroupService.Repo.Group(id, userID)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	if !group.IsMember || (!group.IsOwner && target != userID) {
		re.HandleError(w, r, backend.ErrForbidden)
		return
	}
	if target == group.OwnerID {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	if r.Method == http.MethodPut {
		if !group.IsOwner {
			re.HandleError(w, r, backend.ErrForbidden)
			return
		}
		var input struct {
			Role string `json:"role"`
		}
		if !re.decode(w, r, &input) {
			return
		}
		if input.Role != "owner" {
			re.HandleError(w, r, backend.ErrBadRequest)
			return
		}
		err = re.GroupService.Repo.TransferGroup(id, userID, target)
	} else {
		re.groupChanged(id, "members")
		result, e := re.GroupService.Repo.Conn.Exec("DELETE FROM socialGroupMember WHERE groupId=? AND userId=? AND role<>'owner'", id, target)
		err = e
		if err == nil {
			count, _ := result.RowsAffected()
			if count == 0 {
				err = backend.ErrNotFound
			}
		}
	}
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	re.groupChanged(id, "members")
	respond(w, 200, nil)
}
