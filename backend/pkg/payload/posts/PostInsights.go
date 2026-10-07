package posts

// ReactionDayDTO is one day's reactions in a post's insights.
type ReactionDayDTO struct {
	Day   string `json:"day"`
	Total int    `json:"total"`
	Up    int    `json:"up"`
	Down  int    `json:"down"`
}

// PostAudienceDTO is who may read a post and how many accounts that is. `audience` names
// the rule rather than the post's privacy column, because a `public` post by a private
// profile reaches followers only — the same distinction the composer's audience banner
// draws, and the reason the count is reported beside the name instead of instead of it.
type PostAudienceDTO struct {
	Audience string `json:"audience"`
	Count    int    `json:"count"`
}

// PostInsightsDTO is the author-facing view of one post: its reach, its reactions and
// comments, and how the reactions fall across the days they arrived.
type PostInsightsDTO struct {
	PostId    string           `json:"postId"`
	Reach     PostAudienceDTO  `json:"reach"`
	Reactions int              `json:"reactions"`
	Up        int              `json:"up"`
	Down      int              `json:"down"`
	Comments  int              `json:"comments"`
	Days      []ReactionDayDTO `json:"days"`
}
