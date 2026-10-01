package repositories

import "strings"

// likePattern turns a search box's text into a `LIKE` pattern that matches it
// literally, so a `%` or `_` the reader typed is a character rather than a wildcard.
// The backslash is escaped first, or the escapes added for `%` and `_` would be
// escaped in turn; callers pair the result with `LIKE ? ESCAPE '\'`.
//
// It is one function rather than the same expression written out three times — the
// user, group and post searches each need exactly this — because an escaping rule
// that differs in one of them is the kind of difference nobody notices until a
// search for `50%` returns the whole table.
func likePattern(search string) string {
	escaped := strings.ReplaceAll(search, `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, "%", `\%`)
	escaped = strings.ReplaceAll(escaped, "_", `\_`)
	return "%" + escaped + "%"
}
