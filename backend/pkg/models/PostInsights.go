package models

// ReactionDay is one day's reactions to a post, as the author's insights group them.
// `Day` is the date the reaction row was last written, `YYYY-MM-DD`, in UTC — the same
// instant the rest of the app stores, rather than the reader's local day, because the
// author and the reactor need not share a timezone.
type ReactionDay struct {
	Day   string
	Total int
	Up    int
	Down  int
}

// PostInsights is the raw material for a post's author-only insights: how many accounts
// may read it right now, and what has happened to it so far.
//
// None of it is viewer-relative — the question is "how many people", not "may this
// person" — which is why only the post's author is allowed to ask for it; that is
// enforced in `PostService.PostInsights`.
type PostInsights struct {
	// AuthorId is the account that wrote the post, so the service can refuse anyone else.
	AuthorId string
	// Audience names the rule that decided who may read the post: `everyone`, `followers`
	// or `selected`. It mirrors `postVisibility` rather than the post's own privacy
	// column, because a `public` post by a private profile reaches followers only.
	Audience string
	// Reach is the number of accounts that rule admits right now.
	Reach     int
	Reactions int
	Up        int
	Down      int
	Comments  int
	Days      []ReactionDay
}
