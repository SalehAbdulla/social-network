// Inline vector attachments for the seeded comments.
//
// The media store serves raster uploads only — its allow-list is JPEG, PNG, GIF, WebP, MP4 and
// WebM, deliberately, so an SVG can never be rendered same-origin. A seeded comment can still carry
// a vector picture, though, because the frontend draws a comment's `imageUrls` with a plain
// `<img src>`, and a `data:image/svg+xml;base64,…` URI is one it renders exactly like any other
// picture. That is what these "svg comments" are: a tiny self-contained card, no file on disk, no
// `media` row, nothing the orphan collector has an opinion about.
package main

import (
	"encoding/base64"
	"fmt"
	"strings"
)

var svgCommentPhrases = []string{
	"Small steps, every day.",
	"Make it simple, then make it work.",
	"Good things take a little time.",
	"Always be learning.",
	"Feed the curiosity.",
	"Slow down to move faster.",
	"Ship it, then improve it.",
	"Ask better questions.",
}

var svgCommentPalettes = [][2]string{
	{"#f97316", "#db2777"},
	{"#0ea5e9", "#6366f1"},
	{"#10b981", "#065f46"},
	{"#8b5cf6", "#ec4899"},
	{"#f59e0b", "#ef4444"},
	{"#14b8a6", "#0f766e"},
}

// svgComment renders a small quote card as a base64 data URI. The author picks the palette and the
// wording deterministically, so the same comment always draws the same card.
func svgComment(author string) string {
	hash := 0
	for _, r := range author {
		hash = (hash*31 + int(r)) & 0x7fffffff
	}
	pair := svgCommentPalettes[hash%len(svgCommentPalettes)]
	phrase := svgCommentPhrases[hash%len(svgCommentPhrases)]
	handle := strings.TrimPrefix(author, "seed-")

	svg := fmt.Sprintf(
		`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">`+
			`<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`+
			`<stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient></defs>`+
			`<rect width="640" height="420" rx="24" fill="url(#g)"/>`+
			`<circle cx="104" cy="96" r="48" fill="#ffffff" opacity="0.18"/>`+
			`<circle cx="150" cy="140" r="20" fill="#ffffff" opacity="0.28"/>`+
			`<text x="48" y="242" font-family="Georgia, 'Times New Roman', serif" font-size="40" fill="#ffffff">%s</text>`+
			`<text x="48" y="316" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#ffffff" opacity="0.85">@%s</text>`+
			`</svg>`, pair[0], pair[1], phrase, handle)

	return "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(svg))
}
