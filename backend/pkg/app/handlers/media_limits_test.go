package handlers

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// The browser keeps the same ceilings in `frontend/src/app/lib/mediaLimits.ts`, so
// the composer can refuse a file before the upload is spent. Two languages cannot
// share one literal, so the two copies are held together here instead: this check
// reads the TypeScript module and fails *by name*, on the number that was changed
// alone. That is the failure a reviewer needs — "MAX_IMAGE_BYTES: frontend says X,
// backend enforces Y" — where a comment asking people to keep them in step is not a
// check at all.
//
// The values in that module are written as plain byte counts (`export const X =
// 10485760;`) precisely so this can read them without evaluating anything.
var frontendLimitLine = regexp.MustCompile(`^export const ([A-Z][A-Z0-9_]*) = ([0-9]+);$`)

func TestUploadLimitsMatchTheFrontend(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "frontend", "src", "app", "lib", "mediaLimits.ts")
	source, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("the frontend's limit module is the other half of this check: %v", err)
	}

	frontend := map[string]int64{}
	for _, line := range strings.Split(string(source), "\n") {
		match := frontendLimitLine.FindStringSubmatch(line)
		if match == nil {
			continue
		}
		value, err := strconv.ParseInt(match[2], 10, 64)
		if err != nil {
			t.Fatalf("could not read %s out of %s: %v", match[1], path, err)
		}
		frontend[match[1]] = value
	}
	if len(frontend) == 0 {
		t.Fatalf("no limits were read out of %s: the check would pass over anything", path)
	}

	// Each pair is one ceiling the two sides must agree on. The comment names the
	// constant the browser copy pairs with.
	for _, testCase := range []struct {
		name    string
		backend int64
	}{
		{"MAX_IMAGE_BYTES", maxImageUpload},   // the 10 MB image ceiling
		{"MAX_VIDEO_BYTES", maxUpload},        // the 50 MB file ceiling
		{"MAX_IMAGE_PIXELS", maxImagePixels},  // the decoded-canvas ceiling
		{"MAX_ATTACHMENTS", maxCommentImages}, // comments are capped at this server-side
	} {
		value, known := frontend[testCase.name]
		if !known {
			t.Errorf("%s is missing from %s: the composer no longer knows this limit", testCase.name, path)
			continue
		}
		if value != testCase.backend {
			t.Errorf("%s: the frontend enforces %d where the backend enforces %d — change both, in one commit", testCase.name, value, testCase.backend)
		}
		delete(frontend, testCase.name)
	}

	// Anything left is a ceiling only one side knows about, which is the shape of the
	// bug this file exists to catch. A genuinely client-only limit has to be listed
	// above, on purpose, with its reason.
	for name := range frontend {
		t.Errorf("%s is a limit the frontend knows and the backend does not: add its pair above, or say why it is the composer's own rule", name)
	}
}

// TestHumanBytes pins the wording a refused upload earns. The sizes are the shapes
// the ceilings actually produce: a 12 MB photo against the 10 MB limit, a file at
// the limit, and the small end.
func TestHumanBytes(t *testing.T) {
	for bytes, want := range map[int64]string{
		0:              "0 B",
		68:             "68 B",
		1023:           "1023 B",
		1024:           "1 KB",
		1536:           "1.5 KB",
		maxImageUpload: "10 MB",
		(12 << 20) + 6: "12 MB",
		(10 << 20) + 1: "10 MB", // one byte over rounds to the ceiling itself
		1610612736:     "1536 MB",
	} {
		if got := humanBytes(bytes); got != want {
			t.Errorf("humanBytes(%d) = %q, want %q", bytes, got, want)
		}
	}
}
