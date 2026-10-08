package handlers

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"social-network/backend/pkg/media"
)

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

	for _, testCase := range []struct {
		name    string
		backend int64
	}{
		{"MAX_IMAGE_BYTES", maxImageUpload},
		{"MAX_VIDEO_BYTES", maxUpload},
		{"MAX_IMAGE_PIXELS", maxImagePixels},
		{"MAX_ATTACHMENTS", maxCommentImages},
		{"THUMB_WIDTH", int64(media.ThumbWidth)},
		{"LARGE_WIDTH", int64(media.LargeWidth)},
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

	for name := range frontend {
		t.Errorf("%s is a limit the frontend knows and the backend does not: add its pair above, or say why it is the composer's own rule", name)
	}
}

func TestHumanBytes(t *testing.T) {
	for bytes, want := range map[int64]string{
		0:              "0 B",
		68:             "68 B",
		1023:           "1023 B",
		1024:           "1 KB",
		1536:           "1.5 KB",
		maxImageUpload: "10 MB",
		(12 << 20) + 6: "12 MB",
		(10 << 20) + 1: "10 MB",
		1610612736:     "1536 MB",
	} {
		if got := humanBytes(bytes); got != want {
			t.Errorf("humanBytes(%d) = %q, want %q", bytes, got, want)
		}
	}
}
