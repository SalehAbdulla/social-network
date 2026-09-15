package config

import (
	"fmt"
	"os"
	"path/filepath"
)

// BackendDir locates the nearest backend tree, including when a command is
// started from cmd or cmd/seed. Prefer the nearest tree so isolated test
// databases never resolve to the development database in a parent directory.
func BackendDir() (string, error) {
	start, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("get working directory: %w", err)
	}
	for dir := start; ; dir = filepath.Dir(dir) {
		info, err := os.Stat(filepath.Join(dir, "pkg", "db", "migrations", "sqlite"))
		if err == nil && info.IsDir() {
			return dir, nil
		}
		if filepath.Dir(dir) == dir {
			return "", fmt.Errorf("cannot find backend files from %q: run from backend or one of its subdirectories", start)
		}
	}
}
