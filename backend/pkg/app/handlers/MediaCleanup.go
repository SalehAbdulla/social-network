package handlers

import (
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
)

// MediaGrace is how long an upload may sit unreferenced before the collector
// removes it. An upload is always followed by the request that attaches it, so
// this only has to outlast a slow form; a day is generous and still keeps the
// table and the upload directory bounded.
const MediaGrace = 24 * time.Hour

// MediaCleanupResult reports what one collector pass removed: database rows and
// files. The two differ when a file had already been deleted, or when a file
// outlived its row because an unlink failed.
type MediaCleanupResult struct {
	Rows  int
	Files int
}

// PruneOrphanedMedia deletes the uploads that nothing references any more (see
// repositories.DB.UnreferencedMedia), the files behind them, and UUID-named
// files in the upload directory that have no row at all. It is the backstop for
// the four delete paths the spec cares about — post, comment, story and message
// — plus group content, avatars, cover photos and group images, none of which
// unlink anything when they go away.
//
// It is safe to run while the server is serving: a file is only touched when its
// row is already gone and it is older than grace, and a brand new upload is
// younger than grace by construction.
func (re *HandlerContext) PruneOrphanedMedia(grace time.Duration) (MediaCleanupResult, error) {
	var result MediaCleanupResult
	ids, err := re.SocialService.Repo.UnreferencedMedia(grace)
	if err != nil {
		return result, err
	}
	rows, err := re.SocialService.Repo.DeleteMedia(ids)
	if err != nil {
		return result, err
	}
	result.Rows = rows
	for _, id := range ids {
		if err := os.Remove(filepath.Join(re.App.UploadDir, id)); err == nil {
			result.Files++
		}
	}
	stray, err := re.removeStrayMediaFiles(grace)
	if err != nil {
		return result, err
	}
	result.Files += stray
	return result, nil
}

// removeStrayMediaFiles unlinks UUID-named regular files that no media row
// points at. Only names that parse as a UUID are touched, so anything an
// operator drops into the upload directory (or a nested directory) is left
// alone, and only files older than grace, so an upload whose row is still being
// written is not a candidate.
func (re *HandlerContext) removeStrayMediaFiles(grace time.Duration) (int, error) {
	entries, err := os.ReadDir(re.App.UploadDir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}
	known, err := re.SocialService.Repo.AllMediaIDs()
	if err != nil {
		return 0, err
	}
	referenced := make(map[string]bool, len(known))
	for _, id := range known {
		referenced[id] = true
	}
	cutoff := time.Now().Add(-grace)
	removed := 0
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || referenced[name] {
			continue
		}
		if _, err := uuid.Parse(name); err != nil {
			continue
		}
		info, err := entry.Info()
		if err != nil || info.ModTime().After(cutoff) {
			continue
		}
		if err := os.Remove(filepath.Join(re.App.UploadDir, name)); err == nil {
			removed++
		}
	}
	return removed, nil
}
