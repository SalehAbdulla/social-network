package posts

type ReactionDayDTO struct {
	Day   string `json:"day"`
	Total int    `json:"total"`
	Up    int    `json:"up"`
	Down  int    `json:"down"`
}

type PostAudienceDTO struct {
	Audience string `json:"audience"`
	Count    int    `json:"count"`
}

type PostInsightsDTO struct {
	PostId    string           `json:"postId"`
	Reach     PostAudienceDTO  `json:"reach"`
	Reactions int              `json:"reactions"`
	Up        int              `json:"up"`
	Down      int              `json:"down"`
	Comments  int              `json:"comments"`
	Days      []ReactionDayDTO `json:"days"`
}
