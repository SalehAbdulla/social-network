package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBackendDirFromCommandDirectories(t *testing.T) {
	root := filepath.Join(t.TempDir(), "backend with spaces")
	for _, dir := range []string{"pkg/db/migrations/sqlite", "cmd/seed", "tmp/isolated/pkg/db/migrations/sqlite"} {
		if err := os.MkdirAll(filepath.Join(root, filepath.FromSlash(dir)), 0755); err != nil {
			t.Fatal(err)
		}
	}
	for _, relative := range []string{".", "cmd", "cmd/seed", "tmp/isolated"} {
		t.Run(relative, func(t *testing.T) {
			t.Chdir(filepath.Join(root, filepath.FromSlash(relative)))
			got, err := BackendDir()
			want := root
			if relative == "tmp/isolated" {
				want = filepath.Join(root, "tmp", "isolated")
			}
			if err != nil || got != want {
				t.Fatalf("BackendDir() = %q, %v; want %q", got, err, want)
			}
		})
	}
}
