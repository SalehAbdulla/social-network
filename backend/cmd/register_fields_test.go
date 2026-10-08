package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"testing"

	"social-network/backend/pkg/models"
)

var nicknameShape = regexp.MustCompile(`^[a-z0-9_]{2,33}$`)

func registerValues(first, last, email string) url.Values {
	return url.Values{
		"firstName": {first}, "lastName": {last}, "email": {email},
		"password": {"Register123!x"}, "confirmPassword": {"Register123!x"},
		"birthDate": {"2000-01-01"}, "gender": {"female"},
	}
}

func uploadAvatar(t *testing.T, server *httptest.Server, client integrationClient) string {
	t.Helper()
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	file, err := writer.CreateFormFile("file", "avatar.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write(png); err != nil {
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
	if response.StatusCode != http.StatusCreated {
		data, _ := io.ReadAll(response.Body)
		t.Fatalf("avatar upload: %d %s", response.StatusCode, data)
	}
	var envelope struct {
		Data struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Data.URL == "" {
		t.Fatal("avatar upload returned no URL")
	}
	return envelope.Data.URL
}

func TestRegisterFieldParity(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	stranger := newIntegrationClient(t, server)
	stranger.login("alex@example.com")

	owner := newIntegrationClient(t, server)
	registered := decoded[map[string]string](t, owner.call("POST", "/api/v1/auth/register", registerValues("Nora", "Fields", "nora@example.com"), 201))
	handle := registered["nickname"]
	if !nicknameShape.MatchString(handle) {
		t.Fatalf("a blank nickname produced %q, which is not a usable handle", handle)
	}
	profile := decoded[models.SocialUser](t, owner.call("GET", "/api/v1/users/me", nil, 200))
	if profile.Nickname != handle || profile.Bio != "" || !profile.IsPublic {
		t.Fatalf("mandatory-only signup did not land as expected: %+v", profile)
	}
	userId := profile.UserID

	second := decoded[map[string]string](t, newIntegrationClient(t, server).call("POST", "/api/v1/auth/register", registerValues("Nora", "Fields", "nora2@example.com"), 201))
	if second["nickname"] == handle || !nicknameShape.MatchString(second["nickname"]) {
		t.Fatalf("colliding names produced %q and %q", handle, second["nickname"])
	}

	typed := newIntegrationClient(t, server)
	chosen := decoded[map[string]string](t, typed.call("POST", "/api/v1/auth/register", func() url.Values {
		values := registerValues("Ty", "Ped", "typed@example.com")
		values.Set("nickName", "chosen_handle")
		return values
	}(), 201))
	if chosen["nickname"] != "chosen_handle" {
		t.Fatalf("a typed nickname was rewritten to %q", chosen["nickname"])
	}
	newIntegrationClient(t, server).call("POST", "/api/v1/auth/register", func() url.Values {
		values := registerValues("Dup", "Licate", "duplicate@example.com")
		values.Set("nickName", "chosen_handle")
		return values
	}(), 400)

	private := newIntegrationClient(t, server)
	privateRegistered := decoded[map[string]string](t, private.call("POST", "/api/v1/auth/register", func() url.Values {
		values := registerValues("Pat", "Private", "pat@example.com")
		values.Set("aboutMe", "Only my followers should read this.")
		values.Set("isPublic", "false")
		return values
	}(), 201))
	ownProfile := decoded[models.SocialUser](t, private.call("GET", "/api/v1/users/me", nil, 200))
	if ownProfile.Bio != "Only my followers should read this." || ownProfile.IsPublic {
		t.Fatalf("About Me or the visibility choice was lost: %+v", ownProfile)
	}
	publicView := decoded[models.SocialUser](t, stranger.call("GET", "/api/v1/users/"+privateRegistered["userId"], nil, 200))
	if publicView.IsPublic || publicView.Bio != "" {
		t.Fatalf("a private signup leaked its About Me: %+v", publicView)
	}

	for value, wantPublic := range map[string]bool{"on": true, "off": false} {
		client := newIntegrationClient(t, server)
		client.call("POST", "/api/v1/auth/register", func() url.Values {
			values := registerValues("Spell", "Check", "spelling-"+value+"@example.com")
			values.Set("isPublic", value)
			return values
		}(), 201)
		spelled := decoded[models.SocialUser](t, client.call("GET", "/api/v1/users/me", nil, 200))
		if spelled.IsPublic != wantPublic {
			t.Fatalf("isPublic=%q produced IsPublic=%v, want %v", value, spelled.IsPublic, wantPublic)
		}
	}
	longAbout := func() url.Values {
		values := registerValues("Long", "About", "long@example.com")
		values.Set("aboutMe", strings.Repeat("x", 1001))
		return values
	}
	newIntegrationClient(t, server).call("POST", "/api/v1/auth/register", longAbout(), 400)

	avatarURL := uploadAvatar(t, server, owner)
	current := decoded[models.SocialUser](t, owner.call("GET", "/api/v1/users/me", nil, 200))
	current.Avatar = avatarURL
	updated := decoded[models.SocialUser](t, owner.call("PUT", "/api/v1/users/me", current, 200))
	if updated.Avatar != avatarURL {
		t.Fatalf("the avatar was not saved: %+v", updated)
	}
	seen := decoded[models.SocialUser](t, stranger.call("GET", "/api/v1/users/"+userId, nil, 200))
	if seen.Avatar != avatarURL {
		t.Fatalf("the avatar is missing from the shared profile: %+v", seen)
	}
	owner.call("GET", avatarURL, nil, 200)
	stranger.call("GET", avatarURL, nil, 200)
}
