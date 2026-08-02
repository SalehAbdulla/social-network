package handlers

import (
	"encoding/json"
	"net/http"
	"real-time-forum/pkg/payload"
	"real-time-forum/pkg/payload/category"
)

func (re *HandlerContext) GetCategories(w http.ResponseWriter, r *http.Request) {
	response, err := re.CategoryService.GetCategories()

	if err != nil {
		re.HandleError(w, r, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload.SuccessResponse[[]category.CategoryDTO]{
		Success: true,
		Data:    response,
		Message: "Categories retrieved successfully",
	})
}