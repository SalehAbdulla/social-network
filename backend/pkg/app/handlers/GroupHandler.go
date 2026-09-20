package handlers

import (
	"net/http"
	"strconv"

	backend "social-network/backend"
	"social-network/backend/pkg/models"
)

func (re *HandlerContext) groupID(w http.ResponseWriter, r *http.Request) (int, bool) {
	id, err := strconv.Atoi(r.PathValue("groupId"))
	if err != nil || id < 1 {
		re.HandleError(w, r, backend.ErrBadRequest)
		return 0, false
	}
	return id, true
}

func (re *HandlerContext) ListGroups(w http.ResponseWriter, r *http.Request) {
	offset, ok := re.offset(w, r)
	if !ok {
		return
	}
	groups, err := re.GroupService.Repo.Groups(currentUser(r), r.URL.Query().Get("q"), offset, r.URL.Query().Get("scope") == "joined")
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, groups)
}

func (re *HandlerContext) CreateGroup(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ImageURL    string `json:"imageUrl"`
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	if !re.decode(w, r, &input) {
		return
	}
	if input.ImageURL != "" {
		if err := re.SocialService.ValidateMedia(currentUser(r), input.ImageURL, "image"); err != nil {
			re.HandleError(w, r, err)
			return
		}
	}
	group, err := re.GroupService.Create(currentUser(r), input.Title, input.Description, input.ImageURL)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	re.groupChanged(group.GroupID, "created")
	respond(w, http.StatusCreated, group)
}

func (re *HandlerContext) GetGroup(w http.ResponseWriter, r *http.Request) {
	id, ok := re.groupID(w, r)
	if !ok {
		return
	}
	group, err := re.GroupService.Repo.Group(id, currentUser(r))
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, group)
}

func (re *HandlerContext) JoinGroup(w http.ResponseWriter, r *http.Request) {
	id, ok := re.groupID(w, r)
	if !ok {
		return
	}
	if err := re.GroupService.RequestJoin(id, currentUser(r)); err != nil {
		re.HandleError(w, r, err)
		return
	}
	re.groupChanged(id, "request", currentUser(r))
	if group, err := re.GroupService.Repo.Group(id, currentUser(r)); err == nil {
		re.notificationsChanged(group.OwnerID)
	}
	respond(w, http.StatusOK, nil)
}

func (re *HandlerContext) GetGroupMembers(w http.ResponseWriter, r *http.Request) {
	id, ok := re.groupID(w, r)
	if !ok {
		return
	}
	if err := re.GroupService.RequireMember(id, currentUser(r)); err != nil {
		re.HandleError(w, r, err)
		return
	}
	members, err := re.GroupService.Repo.GroupMembers(id)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, members)
}

func (re *HandlerContext) GetGroupRequests(w http.ResponseWriter, r *http.Request) {
	id, ok := re.groupID(w, r)
	if !ok {
		return
	}
	group, err := re.GroupService.Repo.Group(id, currentUser(r))
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	if !group.IsOwner {
		re.HandleError(w, r, backend.ErrForbidden)
		return
	}
	requests, err := re.GroupService.Repo.GroupRequests(id)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, requests)
}

func (re *HandlerContext) InviteToGroup(w http.ResponseWriter, r *http.Request) {
	groupID, ok := re.groupID(w, r)
	if !ok {
		return
	}
	userID := r.PathValue("userId")
	if userID == "" {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	if err := re.GroupService.Invite(groupID, currentUser(r), userID); err != nil {
		re.HandleError(w, r, err)
		return
	}
	re.notificationsChanged(userID)
	respond(w, http.StatusOK, nil)
}

func (re *HandlerContext) GetGroupInvitations(w http.ResponseWriter, r *http.Request) {
	invitations, err := re.GroupService.Invitations(currentUser(r))
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, invitations)
}

func (re *HandlerContext) DecideGroupInvitation(w http.ResponseWriter, r *http.Request) {
	groupID, ok := re.groupID(w, r)
	if !ok {
		return
	}
	invitationID, err := strconv.Atoi(r.PathValue("invitationId"))
	if err != nil || invitationID < 1 {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	var input struct {
		Status string `json:"status"`
	}
	if !re.decode(w, r, &input) {
		return
	}
	if err := re.GroupService.DecideInvitation(groupID, invitationID, currentUser(r), input.Status); err != nil {
		re.HandleError(w, r, err)
		return
	}
	re.groupChanged(groupID, "membership", currentUser(r))
	respond(w, http.StatusOK, models.GroupInvitation{InvitationID: invitationID, GroupID: groupID, UserID: currentUser(r), Status: input.Status})
}

func (re *HandlerContext) DecideGroupRequest(w http.ResponseWriter, r *http.Request) {
	groupID, ok := re.groupID(w, r)
	if !ok {
		return
	}
	requestID, err := strconv.Atoi(r.PathValue("requestId"))
	if err != nil || requestID < 1 {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	var input struct {
		Status string `json:"status"`
	}
	if !re.decode(w, r, &input) {
		return
	}
	if err := re.GroupService.Decide(groupID, requestID, currentUser(r), input.Status); err != nil {
		re.HandleError(w, r, err)
		return
	}
	// Notify the applicant after the decision commits, including declined requests.
	var applicant string
	if err := re.GroupService.Repo.Conn.QueryRow("SELECT userId FROM socialGroupRequest WHERE groupId=? AND requestId=?", groupID, requestID).Scan(&applicant); err == nil {
		re.groupChanged(groupID, "membership", applicant)
	} else {
		re.groupChanged(groupID, "membership")
	}
	respond(w, http.StatusOK, models.GroupRequest{RequestID: requestID, GroupID: groupID, Status: input.Status})
}
