package handlers

import (
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"

	"social-network/backend/pkg/media"
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
		// A derivative is a file of its own, and its name is not a UUID, so the sweep below
		// would treat it as something an operator put there and leave it forever. It goes with
		// its original, here.
		for _, variant := range media.Variants() {
			if err := os.Remove(filepath.Join(re.App.UploadDir, media.FileName(id, variant))); err == nil {
				result.Files++
			}
		}
	}
	stray, err := re.removeStrayMediaFiles(grace)
	if err != nil {
		return result, err
	}
	result.Files += stray
	return result, nil
}

// removeStrayMediaFiles unlinks regular files that no media row points at, whether they are an
// upload itself or one of its derivatives. A name is only a candidate when its base — the name
// itself, or the upload's id in front of a `_thumb`/`_large` suffix — parses as a UUID, so
// anything an operator drops into the upload directory (`notes.txt`, `notes_large`, a nested
// directory) is left alone; and only files older than grace, so an upload whose row is still
// being written is not a candidate.
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
		if entry.IsDir() {
			continue
		}
		base := name
		if id, _, ok := media.ParseFileName(name); ok {
			base = id
		}
		if _, err := uuid.Parse(base); err != nil {
			continue
		}
		if referenced[base] {
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
