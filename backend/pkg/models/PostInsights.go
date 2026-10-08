package models

type ReactionDay struct {
	Day   string
	Total int
	Up    int
	Down  int
}

type PostInsights struct {
	AuthorId  string
	Audience  string
	Reach     int
	Reactions int
	Up        int
	Down      int
	Comments  int
	Days      []ReactionDay
}
