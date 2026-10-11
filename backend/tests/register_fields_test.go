package tests

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
	"strconv"
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

// The register form asks about an address the same way it asks about a handle, and
// the login form says which of the two fields is wrong instead of both.
func TestEmailAvailabilityAndLoginMessages(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	client := newIntegrationClient(t, server)

	for _, probe := range []struct {
		query string
		want  bool
	}{
		{"email=dummy@example.com", false},
		{"email=DUMMY@example.com", false},
		{"email=%20dummy@example.com%20", false},
		{"email=free@example.com", true},
	} {
		got := decoded[map[string]bool](t, client.call("GET", "/api/v1/auth/email-availability?"+probe.query, nil, 200))
		if got["available"] != probe.want {
			t.Fatalf("%s reported available=%v, want %v", probe.query, got["available"], probe.want)
		}
	}
	client.call("GET", "/api/v1/auth/email-availability?email=not-an-address", nil, 400)
	client.call("GET", "/api/v1/auth/email-availability", nil, 400)

	// An address with no account, and the right password for a different one: the two
	// answers have to be different, and each has to name the field at fault.
	unknown := loginFailure(t, client, "nobody@example.com", "DummyUser123!")
	if !strings.Contains(unknown, "no account") {
		t.Fatalf("an unknown address must say so: %q", unknown)
	}
	wrong := loginFailure(t, client, "dummy@example.com", "NotThePassword123!")
	if !strings.Contains(wrong, "password") || strings.Contains(wrong, "no account") {
		t.Fatalf("a wrong password must be named as one: %q", wrong)
	}
}

// loginFailure posts the login form and returns the message the form would show.
func loginFailure(t *testing.T, client integrationClient, identifier, password string) string {
	t.Helper()
	form := url.Values{"identifier": {identifier}, "password": {password}}
	request, err := http.NewRequest("POST", client.base+"/api/v1/auth/login", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := client.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("a refused login answered %d", response.StatusCode)
	}
	var envelope struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(response.Body).Decode(&envelope); err != nil {
		t.Fatal(err)
	}
	return envelope.Error
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

	// The address has to look like an address, and the punctuation the form used to
	// accept is refused. The full matrix lives in the payload package's own unit
	// test; here the endpoint is checked end to end.
	for _, email := range []string{"mohd@samboosa", "mo<hd@example.com"} {
		values := registerValues("Bad", "Email", email)
		newIntegrationClient(t, server).call("POST", "/api/v1/auth/register", values, 400)
	}
	// The same for a name: letters, spaces, apostrophes, hyphens and dots only.
	for index, name := range []string{"mo@med", "mo_med"} {
		values := registerValues(name, "Name", "bad-name-"+strconv.Itoa(index)+"@example.com")
		newIntegrationClient(t, server).call("POST", "/api/v1/auth/register", values, 400)
	}
	// A name keeps the case it was typed in — only the handle is folded to lower
	// case — and the punctuation a real name uses is kept as it is.
	spaced := newIntegrationClient(t, server)
	spaced.call("POST", "/api/v1/auth/register", registerValues("  Anne-Marie ", "O'Brien", "anne-obrien@example.com"), 201)
	spacedProfile := decoded[models.SocialUser](t, spaced.call("GET", "/api/v1/users/me", nil, 200))
	if spacedProfile.FirstName != "Anne-Marie" || spacedProfile.LastName != "O'Brien" {
		t.Fatalf("a punctuated name was not stored as typed: %+v", spacedProfile)
	}

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
