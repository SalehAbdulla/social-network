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

	"github.com/google/uuid"
)

const (
	maxUpload      = 50 << 20 // video ceiling, and the hard ceiling for every upload
	maxImageUpload = 10 << 20 // images are far cheaper to store and serve
	// Multipart framing (boundaries, headers) sits on top of the file itself, so
	// the request reader is allowed a small margin over the file ceiling. A body
	// bigger than this is refused before it is buffered.
	multipartOverhead = 1 << 20
	// maxImagePixels caps a decoded canvas at 40 megapixels. It is what stops a
	// decompression bomb: a few hundred bytes can declare a canvas far larger than
	// any real photo, and the byte ceiling says nothing about that.
	maxImagePixels = 40_000_000
)

// allowedMediaType is the allow-list of types this API stores and serves. One
// list for both directions on purpose: the upload path decides what may be kept,
// and the read path decides what may be rendered, so a row that holds some other
// type cannot be served as that type.
func allowedMediaType(mime string) bool {
	switch mime {
	case "image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm":
		return true
	}
	return false
}

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
		// No measured size here, unlike the image ceiling below: this gate runs before
		// the type is sniffed, and the request ceiling is this number plus a megabyte,
		// so the only size it could honestly report is the ceiling itself.
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
		// The refusal names the file's own size as well as the ceiling, so the
		// composer's toast reads "Image is 12.4 MB; the limit is 10 MB." rather than
		// about a limit in the abstract. The measurement is rounded to one decimal
		// place, which is why a file one byte over the ceiling reads as the ceiling
		// itself; the sentence still says which file was refused.
		re.HandleError(w, r, backend.WithDetail(backend.ErrImageTooLarge, fmt.Sprintf("Image is %s; the limit is %s.", humanBytes(header.Size), humanBytes(maxImageUpload))))
		return
	}
	if _, err = file.Seek(0, io.SeekStart); err != nil {
		re.HandleError(w, r, backend.ErrInternal)
		return
	}
	// Check real image metadata, rather than trusting an extension or MIME header.
	// Every allowed image format is registered, WebP included, so this also caps a
	// decompression bomb: a canvas over maxImagePixels is refused however small the
	// file is. Only the header is decoded, which is cheap for every format.
	if strings.HasPrefix(mime, "image/") {
		config, _, decodeErr := image.DecodeConfig(file)
		if decodeErr != nil || config.Width < 1 || config.Height < 1 || int64(config.Width)*int64(config.Height) > maxImagePixels {
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

// humanBytes renders a byte count the way a reader expects to see it: "68 B",
// "1.2 KB", "12.4 MB". One decimal place above bytes, without a trailing ".0".
//
// The frontend has its own copy of this rule in `lib/mediaLimits.ts`; the drift
// check in media_limits_test.go compares the *limits* the two sides enforce, not the
// wording, because sharing the wording would mean generating one language from the
// other.
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

// oneDecimal formats to one decimal place and drops a trailing ".0", so a limit of
// exactly ten megabytes reads as "10 MB" rather than "10.0 MB".
func oneDecimal(value float64) string {
	text := strconv.FormatFloat(value, 'f', 1, 64)
	if strings.HasSuffix(text, ".0") {
		return strings.TrimSuffix(text, ".0")
	}
	return text
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
	// The stored row decides the type, so it is checked against the same list the
	// upload used. A row holding anything else — written by a migration, an import
	// or a bug — is handed over as a download rather than served as itself, so an
	// unexpected type can never be rendered by a browser inline.
	contentType := mime
	if !allowedMediaType(mime) {
		contentType = "application/octet-stream"
		w.Header().Set("Content-Disposition", "attachment")
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeFile(w, r, filepath.Join(re.App.UploadDir, id))
}
