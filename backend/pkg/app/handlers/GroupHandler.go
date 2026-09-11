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
	groups, err := re.GroupService.Repo.Groups(currentUser(r), r.URL.Query().Get("q"), offset)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	respond(w, http.StatusOK, groups)
}

func (re *HandlerContext) CreateGroup(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	if !re.decode(w, r, &input) {
		return
	}
	group, err := re.GroupService.Create(currentUser(r), input.Title, input.Description)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
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
	respond(w, http.StatusOK, models.GroupRequest{RequestID: requestID, GroupID: groupID, Status: input.Status})
}
