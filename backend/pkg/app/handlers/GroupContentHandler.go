package handlers

import (
	"encoding/json"
	"net/http"
	backend "social-network/backend"
	"social-network/backend/pkg/models"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

func (re *HandlerContext) GroupContent(w http.ResponseWriter, r *http.Request) {
	groupID, ok := re.groupID(w, r)
	if !ok {
		return
	}
	userID := currentUser(r)
	if err := re.GroupService.RequireMember(groupID, userID); err != nil {
		re.HandleError(w, r, err)
		return
	}
	kind := r.PathValue("kind")
	if kind != "posts" && kind != "comments" && kind != "events" && kind != "messages" && !(r.Method == http.MethodGet && (kind == "timeline" || kind == "media")) {
		re.HandleError(w, r, backend.ErrNotFound)
		return
	}
	contentID := 0
	var existing models.GroupContent
	if r.PathValue("id") != "" {
		var err error
		contentID, err = strconv.Atoi(r.PathValue("id"))
		if err != nil || contentID < 1 {
			re.HandleError(w, r, backend.ErrBadRequest)
			return
		}
		group, err := re.GroupService.Repo.Group(groupID, userID)
		if err != nil {
			re.HandleError(w, r, err)
			return
		}
		existing, err = re.GroupService.Repo.EditableGroupContent(groupID, contentID, kind, userID, group.IsOwner && r.Method == http.MethodDelete)
		if err != nil {
			re.HandleError(w, r, err)
			return
		}
		if r.Method == http.MethodDelete {
			_, err = re.GroupService.Repo.Conn.Exec("DELETE FROM groupContent WHERE groupId=? AND id=?", groupID, contentID)
			if err != nil {
				re.HandleError(w, r, err)
				return
			}
			re.groupChanged(groupID, kind)
			respond(w, 200, nil)
			return
		}
	}
	parentID := 0
	if kind == "comments" {
		var err error
		parentID, err = strconv.Atoi(r.URL.Query().Get("parentId"))
		if err != nil || parentID < 1 {
			re.HandleError(w, r, backend.ErrBadRequest)
			return
		}
		if err = re.GroupService.Repo.GroupContentExists(groupID, parentID, "posts"); err != nil {
			re.HandleError(w, r, err)
			return
		}
	}
	if r.Method == http.MethodGet {
		offset, ok := re.offset(w, r)
		if !ok {
			return
		}
		items, err := re.GroupService.Repo.ListGroupContent(groupID, userID, kind, parentID, offset)
		if err != nil {
			re.HandleError(w, r, err)
			return
		}
		respond(w, 200, items)
		return
	}
	var input struct {
		Title    string `json:"title"`
		Content  string `json:"content"`
		MediaURL string `json:"mediaUrl"`
		StartsAt string `json:"startsAt"`
	}
	if !re.decode(w, r, &input) {
		return
	}
	input.Content = strings.TrimSpace(input.Content)
	input.Title = strings.TrimSpace(input.Title)
	if (input.Content == "" && input.MediaURL == "") || utf8.RuneCountInString(input.Content) > 5000 || utf8.RuneCountInString(input.Title) > 100 {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	if input.MediaURL != "" && input.MediaURL != existing.MediaURL {
		if err := re.SocialService.ValidateMedia(userID, input.MediaURL, "image"); err != nil {
			re.HandleError(w, r, err)
			return
		}
	}
	if kind == "events" {
		start, err := time.Parse(time.RFC3339, input.StartsAt)
		if err != nil || !start.After(time.Now()) || len(input.Title) < 3 || input.Content == "" {
			re.HandleError(w, r, backend.ErrBadRequest)
			return
		}
		input.StartsAt = start.UTC().Format(time.RFC3339)
	} else {
		input.StartsAt = ""
	}
	c := models.GroupContent{GroupID: groupID, UserID: userID, Kind: kind, ParentID: parentID, Title: input.Title, Content: input.Content, MediaURL: input.MediaURL, StartsAt: input.StartsAt}
	if contentID > 0 {
		_, err := re.GroupService.Repo.Conn.Exec("UPDATE groupContent SET title=?,content=?,mediaUrl=?,startsAt=? WHERE groupId=? AND id=?", c.Title, c.Content, c.MediaURL, c.StartsAt, groupID, contentID)
		if err != nil {
			re.HandleError(w, r, err)
			return
		}
		re.groupChanged(groupID, kind)
		respond(w, 200, nil)
		return
	}
	id, err := re.GroupService.Repo.AddGroupContent(c)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	c.ID = id
	re.groupChanged(groupID, kind)
	respond(w, http.StatusCreated, c)
}

func (re *HandlerContext) GroupRSVP(w http.ResponseWriter, r *http.Request) {
	groupID, ok := re.groupID(w, r)
	if !ok {
		return
	}
	userID := currentUser(r)
	if err := re.GroupService.RequireMember(groupID, userID); err != nil {
		re.HandleError(w, r, err)
		return
	}
	eventID, err := strconv.Atoi(r.PathValue("eventId"))
	if err != nil || eventID < 1 {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	if err = re.GroupService.Repo.GroupContentExists(groupID, eventID, "events"); err != nil {
		re.HandleError(w, r, err)
		return
	}
	var input struct {
		Status string `json:"status"`
	}
	if !re.decode(w, r, &input) {
		return
	}
	if input.Status != "going" && input.Status != "not_going" {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	if err = re.GroupService.Repo.SetGroupRSVP(eventID, userID, input.Status); err != nil {
		re.HandleError(w, r, err)
		return
	}
	re.groupChanged(groupID, "events")
	respond(w, 200, nil)
}

func (re *HandlerContext) groupChanged(groupID int, kind string, extraUsers ...string) {
	if re.Hub == nil {
		return
	}
	members, err := re.GroupService.Repo.GroupMembers(groupID)
	if err != nil {
		return
	}
	data, _ := json.Marshal(map[string]any{"type": "group_changed", "payload": map[string]any{"groupId": groupID, "kind": kind}})
	recipients := make(map[string]bool)
	for _, member := range members {
		recipients[member.UserID] = true
	}
	for _, userID := range extraUsers {
		recipients[userID] = true
	}
	for userID := range recipients {
		re.Hub.SendToUser(userID, data)
	}
}
