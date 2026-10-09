package tests

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"social-network/backend/pkg/app/handlers"
	"social-network/backend/pkg/payload/comment"
	"social-network/backend/pkg/payload/message"
	"social-network/backend/pkg/payload/posts"
	"social-network/backend/pkg/web"
)

const onePixelPNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII="

func postMediaFixture(t *testing.T, server *httptest.Server, client integrationClient, name string, data []byte) (int, string, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest("POST", server.URL+"/api/v1/media", &body)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := client.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(response.Body)
	var envelope struct {
		Data struct {
			URL string `json:"url"`
		} `json:"data"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatalf("upload response is not JSON: %s", raw)
	}
	return response.StatusCode, envelope.Error, envelope.Data.URL
}

func TestUploadEdgeCases(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")

	png, err := base64.StdEncoding.DecodeString(onePixelPNG)
	if err != nil {
		t.Fatal(err)
	}

	t.Run("empty file", func(t *testing.T) {
		status, message, _ := postMediaFixture(t, server, client, "empty.png", nil)
		if status != http.StatusBadRequest || !strings.Contains(message, "empty") {
			t.Fatalf("expected a 400 naming the empty file, got %d %q", status, message)
		}
	})

	t.Run("over the 50 MB ceiling", func(t *testing.T) {
		oversized := append([]byte("GIF89a"), make([]byte, (50<<20)+1)...)
		status, message, _ := postMediaFixture(t, server, client, "huge.gif", oversized)
		if status != http.StatusRequestEntityTooLarge || !strings.Contains(message, "50 MB") {
			t.Fatalf("expected a 413 naming the 50 MB limit, got %d %q", status, message)
		}
	})

	t.Run("image over the 10 MB image ceiling", func(t *testing.T) {
		oversized := append([]byte("GIF89a"), make([]byte, 12<<20)...)
		status, message, _ := postMediaFixture(t, server, client, "big.gif", oversized)
		if status != http.StatusRequestEntityTooLarge || !strings.Contains(message, "12 MB") || !strings.Contains(message, "limit is 10 MB") {
			t.Fatalf("expected a 413 naming the file's own size and the 10 MB limit, got %d %q", status, message)
		}
	})

	t.Run("extension disagrees with the bytes", func(t *testing.T) {
		status, message, url := postMediaFixture(t, server, client, "photo.gif", png)
		if status != http.StatusCreated {
			t.Fatalf("a PNG named .gif should be accepted, got %d %q", status, message)
		}
		if strings.HasSuffix(url, "photo.gif") {
			t.Fatalf("the client filename reached the storage path: %q", url)
		}
		request, err := http.NewRequest("GET", server.URL+url, nil)
		if err != nil {
			t.Fatal(err)
		}
		response, err := client.client.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		io.Copy(io.Discard, response.Body)
		if response.StatusCode != http.StatusOK {
			t.Fatalf("uploaded media is not readable: %d", response.StatusCode)
		}
		if got := response.Header.Get("Content-Type"); got != "image/png" {
			t.Fatalf("expected the sniffed type image/png, got %q", got)
		}
		if response.Header.Get("X-Content-Type-Options") != "nosniff" {
			t.Fatal("served media is missing nosniff")
		}
	})

	for name, fixture := range map[string][]byte{
		"an HTML document named .jpg": []byte("<!DOCTYPE html><html><body>hello</body></html>"),
		"a PDF named .png":            []byte("%PDF-1.7\nNot an image"),
	} {
		t.Run(name, func(t *testing.T) {
			status, message, _ := postMediaFixture(t, server, client, "payload.png", fixture)
			if status != http.StatusBadRequest {
				t.Fatalf("expected the payload to be refused with 400, got %d %q", status, message)
			}
		})
	}
}

func buildWebP(width, height int) []byte {
	packed := uint32(width-1) | uint32(height-1)<<14
	payload := []byte{0x2F, 0, 0, 0, 0}
	binary.LittleEndian.PutUint32(payload[1:], packed)
	chunk := append([]byte("VP8L"), 0, 0, 0, 0)
	binary.LittleEndian.PutUint32(chunk[4:], uint32(len(payload)))
	chunk = append(chunk, payload...)
	if len(payload)%2 == 1 {
		chunk = append(chunk, 0)
	}
	file := append([]byte("RIFF"), 0, 0, 0, 0)
	binary.LittleEndian.PutUint32(file[4:], uint32(4+len(chunk)))
	file = append(file, []byte("WEBP")...)
	return append(file, chunk...)
}

func TestUploadHardening(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	client := newIntegrationClient(t, server)
	client.login("dummy@example.com")

	t.Run("an SVG is refused whatever it is called", func(t *testing.T) {
		svg := []byte(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>`)
		status, message, _ := postMediaFixture(t, server, client, "picture.png", svg)
		if status != http.StatusBadRequest {
			t.Fatalf("expected the SVG to be refused with 400, got %d %q", status, message)
		}
	})

	t.Run("a WebP canvas over the cap is refused", func(t *testing.T) {
		status, message, _ := postMediaFixture(t, server, client, "bomb.webp", buildWebP(16384, 16384))
		if status != http.StatusBadRequest {
			t.Fatalf("expected the oversized WebP canvas to be refused with 400, got %d %q", status, message)
		}
	})

	t.Run("a WebP canvas within the cap is accepted and served inline", func(t *testing.T) {
		status, message, url := postMediaFixture(t, server, client, "small.webp", buildWebP(64, 64))
		if status != http.StatusCreated {
			t.Fatalf("expected the small WebP to be accepted, got %d %q", status, message)
		}
		response, err := client.client.Get(server.URL + url)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		io.Copy(io.Discard, response.Body)
		if got := response.Header.Get("Content-Type"); got != "image/webp" {
			t.Fatalf("expected image/webp, got %q", got)
		}
		if got := response.Header.Get("Content-Disposition"); got != "" {
			t.Fatalf("a stored image has to render inline, got Content-Disposition %q", got)
		}
	})

	t.Run("a media row holding a page is downloaded, not rendered", func(t *testing.T) {
		const id = "123e4567-e89b-12d3-a456-4266141740aa"
		page := []byte("<!DOCTYPE html><script>alert(1)</script>")
		if err := repo.AddMedia(id, "dummy-id", "text/html"); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(web.App.UploadDir, id), page, 0600); err != nil {
			t.Fatal(err)
		}
		response, err := client.client.Get(server.URL + "/api/v1/media/" + id)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		body, _ := io.ReadAll(response.Body)
		if response.StatusCode != http.StatusOK {
			t.Fatalf("expected the row to be served, got %d: %s", response.StatusCode, body)
		}
		if got := response.Header.Get("Content-Type"); got != "application/octet-stream" {
			t.Fatalf("expected application/octet-stream, got %q", got)
		}
		if got := response.Header.Get("Content-Disposition"); !strings.HasPrefix(got, "attachment") {
			t.Fatalf("expected an attachment disposition, got %q", got)
		}
		if response.Header.Get("X-Content-Type-Options") != "nosniff" {
			t.Fatal("a downloaded row still has to say nosniff")
		}
		if !bytes.Equal(body, page) {
			t.Fatal("the bytes served are not the bytes stored")
		}
	})
}

func TestArchivedStoryMediaSurvives(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner := newIntegrationClient(t, server)
	owner.login("dummy@example.com")

	id := "123e4567-e89b-12d3-a456-426614174106"
	if err := repo.AddMedia(id, "dummy-id", "image/png"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(web.App.UploadDir, id), []byte("png"), 0600); err != nil {
		t.Fatal(err)
	}
	storyID := decoded[map[string]int](t, owner.call("POST", "/api/v1/stories", map[string]string{
		"content": "", "mediaUrl": "/api/v1/media/" + id, "mediaType": "image", "backgroundColor": "#4f46e5",
	}, 201))["storyId"]

	if result := pruneMedia(t, 0); result.Rows != 0 || result.Files != 0 {
		t.Fatalf("a live story's media was collected: %+v", result)
	}
	if _, err := repo.Conn.Exec("UPDATE story SET expiresAt = datetime('now', '-1 minute') WHERE storyId = ?", storyID); err != nil {
		t.Fatal(err)
	}
	if result := pruneMedia(t, 0); result.Rows != 0 || result.Files != 0 {
		t.Fatalf("an archived story's media was collected: %+v", result)
	}
	if _, err := repo.Conn.Exec("DELETE FROM story WHERE storyId = ?", storyID); err != nil {
		t.Fatal(err)
	}
	if result := pruneMedia(t, 0); result.Rows != 1 || result.Files != 1 {
		t.Fatalf("deleting an archived story left its upload behind: %+v", result)
	}
}

func pruneMedia(t *testing.T, grace time.Duration) handlers.MediaCleanupResult {
	t.Helper()
	result, err := handlers.HandlerCtx.PruneOrphanedMedia(grace)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestOrphanedMediaIsCollected(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner, alex := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	alex.login("alex@example.com")

	seed := func(id string) string {
		t.Helper()
		if err := repo.AddMedia(id, "dummy-id", "image/png"); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(web.App.UploadDir, id), []byte("png"), 0600); err != nil {
			t.Fatal(err)
		}
		return "/api/v1/media/" + id
	}
	rowExists := func(id string) bool {
		var count int
		if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM media WHERE mediaId = ?", id).Scan(&count); err != nil {
			t.Fatal(err)
		}
		return count == 1
	}
	fileExists := func(id string) bool {
		_, err := os.Stat(filepath.Join(web.App.UploadDir, id))
		return err == nil
	}

	ids := map[string]string{
		"post":    "123e4567-e89b-12d3-a456-426614174101",
		"comment": "123e4567-e89b-12d3-a456-426614174102",
		"story":   "123e4567-e89b-12d3-a456-426614174103",
		"message": "123e4567-e89b-12d3-a456-426614174104",
		"lonely":  "123e4567-e89b-12d3-a456-426614174105",
	}
	urls := map[string]string{}
	for name, id := range ids {
		urls[name] = seed(id)
	}

	post := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Media post", "content": "A post with a photo attached to it.", "privacy": "public",
		"imageUrls": []string{urls["post"]},
	}, 201))
	commentHost := decoded[posts.PostDTO](t, owner.call("POST", "/api/v1/posts", map[string]any{
		"title": "Comment host", "content": "A second post to hang the comment on.", "privacy": "public",
	}, 201))
	commentDTO := decoded[comment.CommentDTO](t, owner.call("POST", "/api/v1/posts/comments", map[string]any{
		"postId": commentHost.PostId, "content": "A comment with a photo.", "imageUrls": []string{urls["comment"]},
	}, 201))
	storyID := decoded[map[string]int](t, owner.call("POST", "/api/v1/stories", map[string]string{
		"content": "", "mediaUrl": urls["story"], "mediaType": "image", "backgroundColor": "#4f46e5",
	}, 201))["storyId"]
	messageID := decoded[message.MessageDTO](t, owner.call("POST", "/api/v1/messages", map[string]string{
		"recipientId": "alex-id", "text": "", "mediaUrl": urls["message"], "mediaType": "image",
	}, 201)).MessageId

	if result := pruneMedia(t, time.Hour); result.Rows != 0 || result.Files != 0 {
		t.Fatalf("a grace window collected live media: %+v", result)
	}
	for name, id := range ids {
		if !rowExists(id) || !fileExists(id) {
			t.Fatalf("%s media was removed while referenced: row=%v file=%v", name, rowExists(id), fileExists(id))
		}
	}

	result := pruneMedia(t, 0)
	if result.Rows != 1 || result.Files != 1 {
		t.Fatalf("expected only the unattached upload to be collected, got %+v", result)
	}
	if rowExists(ids["lonely"]) || fileExists(ids["lonely"]) {
		t.Fatal("the unattached upload survived the collector")
	}

	for _, step := range []struct {
		name   string
		target string
		remove func()
	}{
		{"post", "post", func() {
			owner.call("DELETE", "/api/v1/posts?id="+post.PostId, nil, 200)
		}},
		{"comment", "comment", func() {
			owner.call("DELETE", "/api/v1/posts/comments?id="+strconv.Itoa(commentDTO.CommentId), nil, 200)
		}},
		{"story", "story", func() {
			owner.call("DELETE", "/api/v1/stories/"+strconv.Itoa(storyID), nil, 200)
		}},
		{"message", "message", func() {
			owner.call("DELETE", "/api/v1/messages/"+strconv.Itoa(messageID)+"?scope=everyone", nil, 200)
		}},
	} {
		t.Run("after deleting the "+step.name, func(t *testing.T) {
			step.remove()
			result := pruneMedia(t, 0)
			if result.Rows != 1 || result.Files != 1 {
				t.Fatalf("expected one orphan from the deleted %s, got %+v", step.name, result)
			}
			id := ids[step.target]
			if rowExists(id) || fileExists(id) {
				t.Fatalf("the %s media survived: row=%v file=%v", step.name, rowExists(id), fileExists(id))
			}
		})
	}

	t.Run("stray files", func(t *testing.T) {
		stray := filepath.Join(web.App.UploadDir, "99999999-8888-7777-6666-555555555555")
		keep := filepath.Join(web.App.UploadDir, "notes.txt")
		for _, path := range []string{stray, keep} {
			if err := os.WriteFile(path, []byte("stray"), 0600); err != nil {
				t.Fatal(err)
			}
			old := time.Now().Add(-48 * time.Hour)
			if err := os.Chtimes(path, old, old); err != nil {
				t.Fatal(err)
			}
		}
		if removed := pruneMedia(t, time.Hour).Files; removed != 1 {
			t.Fatalf("expected the stray UUID file to be swept, removed %d", removed)
		}
		if _, err := os.Stat(stray); !os.IsNotExist(err) {
			t.Fatal("a UUID-named file with no media row survived")
		}
		if _, err := os.Stat(keep); err != nil {
			t.Fatal("the collector deleted a file it does not own")
		}
	})
}
