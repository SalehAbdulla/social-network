package handlers

import (
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	backend "social-network/backend"

	"github.com/google/uuid"
)

const (
	maxUpload      = 50 << 20 // video ceiling, and the hard ceiling for every upload
	maxImageUpload = 10 << 20 // images are far cheaper to store and serve
	// Multipart framing (boundaries, headers) sits on top of the file itself, so
	// the request reader is allowed a small margin over the file ceiling. A body
	// bigger than this is refused before it is buffered.
	multipartOverhead = 1 << 20
)

// UploadMedia stores one uploaded file and records it in the media table.
//
// The client's filename and extension are deliberately ignored: the type comes
// from the bytes, first via http.DetectContentType and then, for images, via
// image.DecodeConfig, so a `photo.png` that is really a GIF is stored and served
// as image/gif and an HTML or PDF payload wearing an image extension is refused.
// The stored name is a fresh UUID, which also rules out path traversal.
func (re *HandlerContext) UploadMedia(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload+multipartOverhead)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		// A body over the ceiling is a size problem, not a malformed request.
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			re.HandleError(w, r, backend.ErrUploadTooLarge)
			return
		}
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
	if header.Size == 0 {
		re.HandleError(w, r, backend.ErrEmptyUpload)
		return
	}
	if header.Size > maxUpload {
		re.HandleError(w, r, backend.ErrUploadTooLarge)
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
	if !allowed[mime] {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	if strings.HasPrefix(mime, "image/") && header.Size > maxImageUpload {
		re.HandleError(w, r, backend.ErrImageTooLarge)
		return
	}
	if _, err = file.Seek(0, io.SeekStart); err != nil {
		re.HandleError(w, r, backend.ErrInternal)
		return
	}
	// Check real image metadata, rather than trusting an extension or MIME header.
	// WebP is skipped because the standard library has no decoder for it; the
	// sniffed header and the byte ceiling above still apply.
	if strings.HasPrefix(mime, "image/") && mime != "image/webp" {
		config, _, decodeErr := image.DecodeConfig(file)
		if decodeErr != nil || config.Width < 1 || config.Height < 1 || int64(config.Width)*int64(config.Height) > 40000000 {
			re.HandleError(w, r, backend.ErrBadRequest)
			return
		}
		if _, err = file.Seek(0, io.SeekStart); err != nil {
			re.HandleError(w, r, backend.ErrInternal)
			return
		}
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
	allowed, err := re.SocialService.CanViewMedia(id, currentUser(r))
	if err != nil {
		re.HandleError(w, r, err)
		return
	}
	if !allowed {
		re.HandleError(w, r, backend.ErrForbidden)
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeFile(w, r, filepath.Join(re.App.UploadDir, id))
}
