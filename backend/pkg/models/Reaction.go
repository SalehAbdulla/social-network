package models

func ReactionEntityTypes() []string {
	return []string{"post", "comment", "message", "group_post", "group_comment"}
}

func IsReactionEntityType(entityType string) bool {
	for _, known := range ReactionEntityTypes() {
		if known == entityType {
			return true
		}
	}
	return false
}

type Reaction struct {
	ReactionId int
	UserId     string
	EntityType string
	EntityId   int
	Score      int
	CreatedAt  string
}
