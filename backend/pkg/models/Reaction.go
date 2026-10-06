package models

// ReactionEntityTypes is the allow-list of targets a reaction may name. It lives here beside
// the other whitelists so the service's validation and the repository's access check cannot
// drift apart: a type the service accepts but the repository does not know would answer
// "bad request" from deep inside a query, and one the repository knows but the service
// rejects would be a target nobody can reach.
//
// `group_post` and `group_comment` are the group's own content — one row shape,
// `groupContent`, split by kind — and are named separately from `post`/`comment` because the
// feed's two live in their own tables with their own visibility rules.
func ReactionEntityTypes() []string {
	return []string{"post", "comment", "message", "group_post", "group_comment"}
}

// IsReactionEntityType reports whether a reaction may target this type at all. Whether the
// viewer may reach the particular row is a separate question, answered per type in the
// repository.
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
