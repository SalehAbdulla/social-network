package handlers

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	backend "social-network/backend"
)

const maxUpload = 50 << 20

func (re *HandlerContext) UploadMedia(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload+(1<<20))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	defer r.MultipartForm.RemoveAll()
	file, header, err := r.FormFile("file")
	if err != nil {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	defer file.Close()
	if header.Size == 0 || header.Size > maxUpload {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	head := make([]byte, 512)
	n, err := file.Read(head)
	if err != nil && err != io.EOF {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	mime := http.DetectContentType(head[:n])
	allowed := map[string]bool{"image/jpeg": true, "image/png": true, "image/gif": true, "image/webp": true, "video/mp4": true, "video/webm": true}
	if !allowed[mime] || (strings.HasPrefix(mime, "image/") && header.Size > 10<<20) {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	if _, err = file.Seek(0, io.SeekStart); err != nil {
		re.HandleError(w, r, backend.ErrInternal)
		return
	}
	if err = os.MkdirAll(re.App.UploadDir, 0755); err != nil {
		re.HandleError(w, r, backend.ErrInternal)
		return
	}
	id := uuid.NewString()
	path := filepath.Join(re.App.UploadDir, id)
	destination, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		re.HandleError(w, r, backend.ErrInternal)
		return
	}
	_, copyErr := io.Copy(destination, file)
	closeErr := destination.Close()
	if copyErr != nil || closeErr != nil {
		os.Remove(path)
		re.HandleError(w, r, backend.ErrInternal)
		return
	}
	if err = re.SocialService.Repo.AddMedia(id, currentUser(r), mime); err != nil {
		os.Remove(path)
		re.HandleError(w, r, backend.ErrInternal)
		return
	}
	respond(w, http.StatusCreated, map[string]string{"url": "/api/v1/media/" + id, "mediaType": strings.SplitN(mime, "/", 2)[0]})
}

func (re *HandlerContext) GetMedia(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := uuid.Parse(id); err != nil {
		re.HandleError(w, r, backend.ErrNotFound)
		return
	}
	_, mime, err := re.SocialService.Repo.MediaInfo(id)
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeFile(w, r, filepath.Join(re.App.UploadDir, id))
}
