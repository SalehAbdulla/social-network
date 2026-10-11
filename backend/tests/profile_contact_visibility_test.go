package tests

import (
	"testing"

	"social-network/backend/pkg/models"
)

func TestProfileContactVisibility(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	alex, dummy := newIntegrationClient(t, server), newIntegrationClient(t, server)
	alex.login("alex@example.com")
	dummy.login("dummy@example.com")

	profile := decoded[models.SocialUser](t, alex.call("GET", "/api/v1/users/me", nil, 200))
	profile.Website = "https://alex.example"
	profile.ContactEmail = "alex@example.com"
	profile.Phone = "+1 555 000 0000"
	profile.ShowWebsite = true
	profile.ShowContactEmail = false
	profile.ShowPhone = false
	alex.call("PUT", "/api/v1/users/me", profile, 200)

	owner := decoded[models.SocialUser](t, alex.call("GET", "/api/v1/users/me", nil, 200))
	if owner.Website != "https://alex.example" || owner.ContactEmail != "alex@example.com" || owner.Phone != "+1 555 000 0000" {
		t.Fatalf("the owner lost a stored contact field: %+v", owner)
	}
	if !owner.ShowWebsite || owner.ShowContactEmail || owner.ShowPhone {
		t.Fatalf("the public switches did not survive the save: %+v", owner)
	}

	viewer := decoded[models.SocialUser](t, dummy.call("GET", "/api/v1/users/alex-id", nil, 200))
	if viewer.Website != "https://alex.example" {
		t.Fatalf("a website with its switch on was hidden: %q", viewer.Website)
	}
	if viewer.ContactEmail != "" || viewer.Phone != "" {
		t.Fatalf("a field switched off reached another member: email=%q phone=%q", viewer.ContactEmail, viewer.Phone)
	}
	if viewer.Bio == "" && viewer.FirstName == "" {
		t.Fatalf("the profile itself was masked along with the contact fields: %+v", viewer)
	}

	owner.ShowContactEmail = true
	alex.call("PUT", "/api/v1/users/me", owner, 200)
	again := decoded[models.SocialUser](t, dummy.call("GET", "/api/v1/users/alex-id", nil, 200))
	if again.ContactEmail != "alex@example.com" {
		t.Fatalf("re-publishing the email lost the stored value: %q", again.ContactEmail)
	}
	if again.Phone != "" {
		t.Fatalf("an unrelated flip published the phone too: %q", again.Phone)
	}

	owner.IsPublic = false
	alex.call("PUT", "/api/v1/users/me", owner, 200)
	hidden := decoded[models.SocialUser](t, dummy.call("GET", "/api/v1/users/alex-id", nil, 200))
	if hidden.Website != "" || hidden.ContactEmail != "" || hidden.Phone != "" {
		t.Fatalf("a private profile leaked a contact field: %+v", hidden)
	}
}

// A list is still a read. A private profile a viewer may not see keeps its handle
// and its name — that is what makes it findable — and gives up its photo, its bio
// and its contact fields, and the photo is refused by the media endpoint too.
func TestPrivateProfileDetailsStayOutOfLists(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	owner, stranger := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	stranger.login("alex@example.com")

	avatar := uploadAvatar(t, server, owner)
	profile := decoded[models.SocialUser](t, owner.call("GET", "/api/v1/users/me", nil, 200))
	profile.Avatar = avatar
	profile.Bio = "Only my followers should read this."
	profile.Location = "Somewhere"
	profile.Website = "https://dummy.example"
	profile.ContactEmail = "dummy@example.com"
	profile.Phone = "+1 555 000 0000"
	profile.ShowWebsite, profile.ShowContactEmail, profile.ShowPhone = true, true, true
	profile.IsPublic = false
	owner.call("PUT", "/api/v1/users/me", profile, 200)

	listed := decoded[[]models.SocialUser](t, stranger.call("GET", "/api/v1/users?q=dummy", nil, 200))
	if len(listed) != 1 {
		t.Fatalf("the private account is missing from discover: %+v", listed)
	}
	seen := listed[0]
	if seen.Avatar != "" || seen.Bio != "" || seen.Location != "" || seen.Website != "" || seen.ContactEmail != "" || seen.Phone != "" {
		t.Fatalf("discover carried a private profile's details: %+v", seen)
	}
	if seen.PostCount != 0 || len(seen.Followers) != 0 || len(seen.Following) != 0 {
		t.Fatalf("discover carried a private profile's counts: %+v", seen)
	}
	if seen.Nickname == "" || seen.FirstName == "" {
		t.Fatalf("discover must still identify the account it lists: %+v", seen)
	}

	// The photo itself is refused to the same viewer, and served to its owner.
	stranger.call("GET", avatar, nil, 404)
	owner.call("GET", avatar, nil, 200)

	// A suggestion is a list too: a private account offers its handle and nothing else.
	suggested := decoded[[]models.UserSuggestion](t, stranger.call("GET", "/api/v1/users/suggestions?limit=30", nil, 200))
	for _, person := range suggested {
		if person.UserID == "dummy-id" && person.Avatar != "" {
			t.Fatalf("a private account's photo was suggested: %+v", person)
		}
	}

	// A follower sees the profile it follows, photo included.
	stranger.call("PUT", "/api/v1/users/dummy-id/follow", nil, 200)
	owner.call("PUT", "/api/v1/follow-requests/alex-id", nil, 200)
	after := decoded[[]models.SocialUser](t, stranger.call("GET", "/api/v1/users?q=dummy", nil, 200))
	if len(after) != 1 || after[0].Avatar != avatar || after[0].Bio == "" || after[0].ContactEmail != "dummy@example.com" {
		t.Fatalf("a follower did not get the profile back: %+v", after)
	}
	stranger.call("GET", avatar, nil, 200)
}

// The account's own email, date of birth and gender are part of the profile the
// owner sees, and of nothing else — not another member's view of it, not discover
// and not the follow lists, all of which reuse the same struct.
func TestProfileDetailsAreOwnerOnly(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	alex, dummy := newIntegrationClient(t, server), newIntegrationClient(t, server)
	alex.login("alex@example.com")
	dummy.login("dummy@example.com")

	owner := decoded[models.SocialUser](t, alex.call("GET", "/api/v1/users/me", nil, 200))
	if owner.Email != "alex@example.com" || owner.BirthDate == "" || owner.Gender == "" {
		t.Fatalf("the owner's own profile is missing its account details: %+v", owner)
	}
	ownByID := decoded[models.SocialUser](t, alex.call("GET", "/api/v1/users/alex-id", nil, 200))
	if ownByID.Email != owner.Email || ownByID.BirthDate != owner.BirthDate || ownByID.Gender != owner.Gender {
		t.Fatalf("the owner's profile by id hid its own details: %+v", ownByID)
	}
	byHandle := decoded[models.SocialUser](t, alex.call("GET", "/api/v1/handles/alexdemo", nil, 200))
	if byHandle.Email == "" {
		t.Fatal("the owner's profile by handle hid its own details")
	}
	// The edit dialog falls back to this endpoint for the address, so it has to
	// carry it.
	if viaAuthMe := decoded[map[string]any](t, alex.call("GET", "/api/v1/auth/me", nil, 200)); viaAuthMe["email"] != owner.Email {
		t.Fatalf("GET /auth/me lost the address: %+v", viaAuthMe)
	}

	seen := decoded[models.SocialUser](t, dummy.call("GET", "/api/v1/users/alex-id", nil, 200))
	if seen.Email != "" || seen.BirthDate != "" || seen.Gender != "" {
		t.Fatalf("another member received the account details: %+v", seen)
	}
	for _, listed := range []struct {
		name   string
		people []models.SocialUser
	}{
		{"discover", decoded[[]models.SocialUser](t, dummy.call("GET", "/api/v1/users?q=alex", nil, 200))},
		{"follow lists", decoded[map[string][]models.SocialUser](t, alex.call("GET", "/api/v1/users/alex-id/follows", nil, 200))["followers"]},
	} {
		for _, person := range listed.people {
			if person.Email != "" || person.BirthDate != "" || person.Gender != "" {
				t.Fatalf("%s carried account details: %+v", listed.name, person)
			}
		}
	}

	// Gender is editable from the profile, and the rule is the registration one.
	owner.Gender = "female"
	saved := decoded[models.SocialUser](t, alex.call("PUT", "/api/v1/users/me", owner, 200))
	if saved.Gender != "female" {
		t.Fatalf("the gender was not saved: %+v", saved)
	}
	if reread := decoded[models.SocialUser](t, alex.call("GET", "/api/v1/users/me", nil, 200)); reread.Gender != "female" {
		t.Fatalf("the gender did not survive a reload: %+v", reread)
	}
	owner.Gender = "unspecified"
	alex.call("PUT", "/api/v1/users/me", owner, 400)
	owner.Gender = ""
	saved = decoded[models.SocialUser](t, alex.call("PUT", "/api/v1/users/me", owner, 200))
	if saved.Gender != "female" {
		t.Fatalf("a blank gender overwrote the stored one: %+v", saved)
	}
}
