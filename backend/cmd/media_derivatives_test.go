package main

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"social-network/backend/pkg/media"
)

// buildPhoto is a real JPEG rather than a header: the derivatives are the subject here, so the
// upload has to be a picture the resize path can do something with. The size is bigger than both
// caps on purpose — 3200x2400 is an ordinary phone photo, and the item is about exactly that
// picture arriving in a feed at full resolution.
func buildPhoto(t *testing.T, width, height int) []byte {
	t.Helper()
	canvas := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			canvas.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: uint8((x + y) % 256), A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, canvas, &jpeg.Options{Quality: 92}); err != nil {
		t.Fatal(err)
	}
	return encoded.Bytes()
}

// fetchMedia gets one media URL through a signed-in client and reports the status, the type and
// the body, so a test can decode what the server actually sent rather than trusting a length.
func fetchMedia(t *testing.T, server *httptest.Server, client integrationClient, path string) (int, string, []byte) {
	t.Helper()
	response, err := client.client.Get(server.URL + path)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	return response.StatusCode, response.Header.Get("Content-Type"), body
}

// TestPhotoUploadGetsDerivatives is the measurement this item is about: what a feed card costs
// after the change, and that the three spellings of one URL answer three different pictures.
func TestPhotoUploadGetsDerivatives(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")

	photo := buildPhoto(t, 3200, 2400)
	status, message, url := postMediaFixture(t, server, client, "holiday.jpg", photo)
	if status != http.StatusCreated {
		t.Fatalf("a 3200x2400 jpeg should upload, got %d %q", status, message)
	}
	id := strings.TrimPrefix(url, "/api/v1/media/")
	for _, variant := range media.Variants() {
		path := filepath.Join(app.UploadDir, media.FileName(id, variant))
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("%s should have been written beside the original: %v", variant.String(), err)
		}
	}

	originalStatus, originalType, originalBody := fetchMedia(t, server, client, url)
	if originalStatus != http.StatusOK || originalType != "image/jpeg" {
		t.Fatalf("the original should still be served as a jpeg, got %d %q", originalStatus, originalType)
	}
	thumbStatus, thumbType, thumbBody := fetchMedia(t, server, client, url+"?size=thumb")
	if thumbStatus != http.StatusOK || thumbType != "image/jpeg" {
		t.Fatalf("the thumbnail should be served as a jpeg, got %d %q", thumbStatus, thumbType)
	}
	thumbConfig, thumbFormat, err := image.DecodeConfig(bytes.NewReader(thumbBody))
	if err != nil {
		t.Fatalf("the thumbnail is not a decodable image: %v", err)
	}
	if thumbFormat != "jpeg" || thumbConfig.Width != media.ThumbWidth {
		t.Fatalf("expected a %dpx jpeg thumbnail, got %s %dpx", media.ThumbWidth, thumbFormat, thumbConfig.Width)
	}
	largeStatus, _, largeBody := fetchMedia(t, server, client, url+"?size=large")
	if largeStatus != http.StatusOK {
		t.Fatalf("the large variant should be served, got %d", largeStatus)
	}
	largeConfig, _, err := image.DecodeConfig(bytes.NewReader(largeBody))
	if err != nil {
		t.Fatal(err)
	}
	if largeConfig.Width != media.LargeWidth {
		t.Fatalf("expected a %dpx large variant, got %dpx", media.LargeWidth, largeConfig.Width)
	}
	t.Logf("the same photo over the wire: original %d bytes, large %d bytes, thumb %d bytes",
		len(originalBody), len(largeBody), len(thumbBody))

	if len(thumbBody) >= len(originalBody) || len(largeBody) >= len(originalBody) {
		t.Fatalf("a derivative must be smaller than the original: thumb %d, large %d, original %d",
			len(thumbBody), len(largeBody), len(originalBody))
	}

	// "original" is accepted as a word, and a value nobody knows is refused rather than quietly
	// answered with the full-size file.
	sameStatus, _, sameBody := fetchMedia(t, server, client, url+"?size=original")
	if sameStatus != http.StatusOK || len(sameBody) != len(originalBody) {
		t.Fatalf("?size=original should serve the original: %d, %d bytes", sameStatus, len(sameBody))
	}
	typoStatus, _, _ := fetchMedia(t, server, client, url+"?size=thumbs")
	if typoStatus != http.StatusBadRequest {
		t.Fatalf("an unknown size should be a 400, got %d", typoStatus)
	}
}

// buildAnimatedGIF is two frames wide enough that the format, not the size, is the reason it gets
// no derivative: a still derivative of an animation is a different picture, not a smaller one.
func buildAnimatedGIF(t *testing.T) []byte {
	t.Helper()
	frames := []*image.Paletted{}
	for frame := 0; frame < 2; frame++ {
		canvas := image.NewPaletted(image.Rect(0, 0, 600, 400), color.Palette{color.Black, color.White})
		for index := range canvas.Pix {
			canvas.Pix[index] = uint8((index + frame) % 2)
		}
		frames = append(frames, canvas)
	}
	var encoded bytes.Buffer
	if err := gif.EncodeAll(&encoded, &gif.GIF{Image: frames, Delay: []int{10, 10}}); err != nil {
		t.Fatal(err)
	}
	return encoded.Bytes()
}

// TestSmallAndAnimatedUploadsHaveNoDerivatives covers the fallback the whole design rests on: an
// image with no derivative still answers `?size=` with the original, so a caller needs to know
// nothing about which uploads have what.
func TestSmallAndAnimatedUploadsHaveNoDerivatives(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")

	pixel, err := base64.StdEncoding.DecodeString(onePixelPNG)
	if err != nil {
		t.Fatal(err)
	}
	for _, upload := range []struct {
		name string
		data []byte
		want string
	}{
		{"pixel.png", pixel, "image/png"},
		{"animation.gif", buildAnimatedGIF(t), "image/gif"},
	} {
		t.Run(upload.name, func(t *testing.T) {
			status, message, url := postMediaFixture(t, server, client, upload.name, upload.data)
			if status != http.StatusCreated {
				t.Fatalf("upload refused: %d %q", status, message)
			}
			id := strings.TrimPrefix(url, "/api/v1/media/")
			for _, variant := range media.Variants() {
				if _, err := os.Stat(filepath.Join(app.UploadDir, media.FileName(id, variant))); !os.IsNotExist(err) {
					t.Fatalf("%s should not exist for %s (err=%v)", variant.String(), upload.name, err)
				}
			}
			_, _, original := fetchMedia(t, server, client, url)
			status, contentType, asked := fetchMedia(t, server, client, url+"?size=thumb")
			if status != http.StatusOK {
				t.Fatalf("?size=thumb should fall back to the original, got %d", status)
			}
			if len(asked) != len(original) {
				t.Fatalf("the fallback should be the original byte for byte: %d vs %d", len(asked), len(original))
			}
			if contentType != upload.want {
				t.Fatalf("the fallback must keep its type, expected %q got %q", upload.want, contentType)
			}
		})
	}
}

// TestDerivativeRequestsAreBehindAuthentication is the one security claim that adding a query
// parameter could have broken: a variant goes through the same access check as the original, so
// an unauthenticated caller cannot read a picture by asking for a smaller copy of it.
func TestDerivativeRequestsAreBehindAuthentication(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	owner := newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	status, message, url := postMediaFixture(t, server, owner, "holiday.jpg", buildPhoto(t, 1200, 900))
	if status != http.StatusCreated {
		t.Fatalf("upload refused: %d %q", status, message)
	}

	anonymous := newIntegrationClient(t, server)
	for _, path := range []string{url, url + "?size=thumb", url + "?size=large"} {
		response, err := anonymous.client.Get(server.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, response.Body)
		response.Body.Close()
		if response.StatusCode != http.StatusUnauthorized {
			t.Fatalf("%s without a session should be a 401, got %d", path, response.StatusCode)
		}
	}
}

// TestCollectedMediaTakesItsDerivativesWithIt covers the leak this change would otherwise have
// introduced: a derivative's name is not a UUID, so the stray sweep used to treat it as a file an
// operator had put there and leave it behind forever. An operator's own files are still safe —
// that promise is the reason the sweep is so careful in the first place.
func TestCollectedMediaTakesItsDerivativesWithIt(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")

	// Uploaded and never attached, so the collector owns it once the grace window is zero.
	status, message, url := postMediaFixture(t, server, client, "orphan.jpg", buildPhoto(t, 2000, 1500))
	if status != http.StatusCreated {
		t.Fatalf("upload refused: %d %q", status, message)
	}
	id := strings.TrimPrefix(url, "/api/v1/media/")
	for _, variant := range media.Variants() {
		if _, err := os.Stat(filepath.Join(app.UploadDir, media.FileName(id, variant))); err != nil {
			t.Fatalf("the upload should have produced %s: %v", variant.String(), err)
		}
	}

	// A stray derivative of an upload that never existed, and two files that are plainly not this
	// application's, all old enough to be candidates for the sweep.
	strayDerivative := filepath.Join(app.UploadDir, media.FileName(uuid.NewString(), media.Variants()[0]))
	operatorNotes := filepath.Join(app.UploadDir, "notes_large")
	operatorText := filepath.Join(app.UploadDir, "notes.txt")
	for _, path := range []string{strayDerivative, operatorNotes, operatorText} {
		if err := os.WriteFile(path, []byte("stray"), 0600); err != nil {
			t.Fatal(err)
		}
		old := time.Now().Add(-48 * time.Hour)
		if err := os.Chtimes(path, old, old); err != nil {
			t.Fatal(err)
		}
	}

	pruneMedia(t, 0)

	for _, variant := range media.Variants() {
		path := filepath.Join(app.UploadDir, media.FileName(id, variant))
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("%s outlived its row (err=%v)", path, err)
		}
	}
	if _, err := os.Stat(strayDerivative); !os.IsNotExist(err) {
		t.Fatalf("a derivative with no row at all should be swept, err=%v", err)
	}
	for _, keep := range []string{operatorNotes, operatorText} {
		if _, err := os.Stat(keep); err != nil {
			t.Fatalf("%s is not this application's file and must survive: %v", filepath.Base(keep), err)
		}
	}
}
