package comment

type CommentResponse struct {
	Comments      []CommentDTO `json:"comments"`
	PageNumber    int          `json:"pageNumber"`
	PageSize      int          `json:"pageSize"`
	TotalElements int          `json:"totalElements"`
	TotalPages    int          `json:"totalPages"`
	LastPage      bool         `json:"lastPage"`
}