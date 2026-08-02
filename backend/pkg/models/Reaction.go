package models

type Reaction struct {
	ReactionId int
	UserId     string
	EntityType string
	EntityId   int
	Score      int
	CreatedAt  string
}