package handlers

import (
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"

	"social-network/backend/pkg/media"
)

const MediaGrace = 24 * time.Hour

type MediaCleanupResult struct {
	Rows  int
	Files int
}

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
