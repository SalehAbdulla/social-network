package handlers

import (
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	_ "golang.org/x/image/webp"

	backend "social-network/backend"
	"social-network/backend/pkg/media"

	"github.com/google/uuid"
)

const (
	maxUpload         = 50 << 20
	maxImageUpload    = 10 << 20
	multipartOverhead = 1 << 20
	maxImagePixels    = 40_000_000
)

func allowedMediaType(mime string) bool {
	switch mime {
	case "image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm":
		return true
	}
	return false
}

func (re *HandlerContext) UploadMedia(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload+multipartOverhead)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
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
	if !allowedMediaType(mime) {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
	if strings.HasPrefix(mime, "image/") && header.Size > maxImageUpload {
		re.HandleError(w, r, backend.WithDetail(backend.ErrImageTooLarge, fmt.Sprintf("Image is %s; the limit is %s.", humanBytes(header.Size), humanBytes(maxImageUpload))))
		return
	}
	if _, err = file.Seek(0, io.SeekStart); err != nil {
		re.HandleError(w, r, backend.ErrInternal)
		return
	}
	var imageWidth int
	if strings.HasPrefix(mime, "image/") {
		config, _, decodeErr := image.DecodeConfig(file)
		if decodeErr != nil || config.Width < 1 || config.Height < 1 || int64(config.Width)*int64(config.Height) > maxImagePixels {
			re.HandleError(w, r, backend.ErrBadRequest)
			return
		}
		imageWidth = config.Width
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
	if written := re.writeDerivatives(id, mime, imageWidth); written > 0 {
		re.App.Logger.Debug("media derivatives written", "mediaId", id, "count", written)
	}
	respond(w, http.StatusCreated, map[string]string{"url": "/api/v1/media/" + id, "mediaType": strings.SplitN(mime, "/", 2)[0]})
}

func (re *HandlerContext) writeDerivatives(id, contentType string, width int) int {
	planned := media.Plan(contentType, width)
	if len(planned) == 0 {
		return 0
	}
	source, err := os.ReadFile(filepath.Join(re.App.UploadDir, id))
	if err != nil {
		re.App.Logger.Warn("could not read an upload back for its derivatives", "mediaId", id, "error", err)
		return 0
	}
	written := 0
	for _, variant := range planned {
		encoded, _, err := media.Encode(source, contentType, variant)
		if errors.Is(err, media.ErrAlreadyNarrow) {
			continue
		}
		if err != nil {
			re.App.Logger.Warn("could not derive a media variant", "mediaId", id, "variant", variant.String(), "error", err)
			continue
		}
		if err := os.WriteFile(filepath.Join(re.App.UploadDir, media.FileName(id, variant)), encoded, 0600); err != nil {
			re.App.Logger.Warn("could not store a media variant", "mediaId", id, "variant", variant.String(), "error", err)
			continue
		}
		written++
	}
	return written
}

func humanBytes(bytes int64) string {
	switch {
	case bytes < 1024:
		return strconv.FormatInt(bytes, 10) + " B"
	case bytes < 1024*1024:
		return oneDecimal(float64(bytes)/1024) + " KB"
	default:
		return oneDecimal(float64(bytes)/(1024*1024)) + " MB"
	}
}

func oneDecimal(value float64) string {
	text := strconv.FormatFloat(value, 'f', 1, 64)
	if strings.HasSuffix(text, ".0") {
		return strings.TrimSuffix(text, ".0")
	}
	return text
}

func (re *HandlerContext) GetMedia(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	variant, sizeKnown := media.ParseSize(r.URL.Query().Get("size"))
	if !sizeKnown {
		re.HandleError(w, r, backend.ErrBadRequest)
		return
	}
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
		re.HandleError(w, r, backend.ErrNotFound)
		return
	}
	name := id
	contentType := mime
	if variant.Name != "" {
		if _, err := os.Stat(filepath.Join(re.App.UploadDir, media.FileName(id, variant))); err == nil {
			name = media.FileName(id, variant)
			contentType = media.OutputType(mime)
		}
	}
	if !allowedMediaType(mime) {
		contentType = "application/octet-stream"
		name = id
		w.Header().Set("Content-Disposition", "attachment")
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeFile(w, r, filepath.Join(re.App.UploadDir, name))
}
