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

// A list is still a read. A private profile a viewer may not see keeps its handle,
// its name and its photo — the handle and the name make it findable, and the photo is
// public the way it is on Instagram, so unfollowing never turns a face into initials —
// and gives up its bio, its location, its contact fields and its counts.
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
	if seen.Avatar != avatar {
		t.Fatalf("discover must carry the avatar, which is public: %+v", seen)
	}
	if seen.Bio != "" || seen.Location != "" || seen.Website != "" || seen.ContactEmail != "" || seen.Phone != "" {
		t.Fatalf("discover carried a private profile's details: %+v", seen)
	}
	if seen.PostCount != 0 || len(seen.Followers) != 0 || len(seen.Following) != 0 {
		t.Fatalf("discover carried a private profile's counts: %+v", seen)
	}
	if seen.Nickname == "" || seen.FirstName == "" {
		t.Fatalf("discover must still identify the account it lists: %+v", seen)
	}

	// The photo itself is public: it is served to a stranger and to its owner alike.
	stranger.call("GET", avatar, nil, 200)
	owner.call("GET", avatar, nil, 200)

	// A suggestion is a list too: it keeps the handle, the name and the photo, and
	// gives up everything a private account holds back.
	suggested := decoded[[]models.UserSuggestion](t, stranger.call("GET", "/api/v1/users/suggestions?limit=30", nil, 200))
	for _, person := range suggested {
		if person.UserID == "dummy-id" && person.Avatar != avatar {
			t.Fatalf("a private account's photo is public and must be suggested: %+v", person)
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

// The sign-in address is part of the profile only the owner sees — not another
// member's view of it, not discover and not the follow lists, all of which reuse the
// same struct. The date of birth and the gender ride the profile itself, each behind
// the owner's switch, and stay out of the lists.
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
	if seen.Email != "" {
		t.Fatalf("another member received the sign-in address: %+v", seen)
	}
	if seen.BirthDate != owner.BirthDate || seen.Gender != owner.Gender {
		t.Fatalf("a visitor must see the date of birth and gender the owner shows: %+v", seen)
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

	// The date of birth is editable from the profile too, under the age rule
	// registration applies: a real date, not in the future, 13 to 100 years old.
	owner.BirthDate = "1995-06-15"
	saved = decoded[models.SocialUser](t, alex.call("PUT", "/api/v1/users/me", owner, 200))
	if saved.BirthDate != "1995-06-15" {
		t.Fatalf("the birth date was not saved: %+v", saved)
	}
	if reread := decoded[models.SocialUser](t, alex.call("GET", "/api/v1/users/me", nil, 200)); reread.BirthDate != "1995-06-15" {
		t.Fatalf("the birth date did not survive a reload: %+v", reread)
	}
	owner.BirthDate = "3000-01-01"
	alex.call("PUT", "/api/v1/users/me", owner, 400)
	owner.BirthDate = "not-a-date"
	alex.call("PUT", "/api/v1/users/me", owner, 400)
	owner.BirthDate = ""
	saved = decoded[models.SocialUser](t, alex.call("PUT", "/api/v1/users/me", owner, 200))
	if saved.BirthDate != "1995-06-15" {
		t.Fatalf("a blank birth date overwrote the stored one: %+v", saved)
	}
}

// The date of birth and the gender are part of the profile a visitor reads, each
// behind a switch the owner controls from the edit form. Switching one off hides it
// from everyone but the owner, and the two switches act independently.
func TestProfileDetailsVisibilitySwitches(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	owner, visitor := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	visitor.login("alex@example.com")

	profile := decoded[models.SocialUser](t, owner.call("GET", "/api/v1/users/me", nil, 200))
	if !profile.ShowBirthDate || !profile.ShowGender {
		t.Fatalf("both switches have to start on: %+v", profile)
	}
	if seen := decoded[models.SocialUser](t, visitor.call("GET", "/api/v1/users/dummy-id", nil, 200)); seen.BirthDate == "" || seen.Gender == "" {
		t.Fatalf("a visitor must see what the switches publish: %+v", seen)
	}

	profile.ShowBirthDate, profile.ShowGender = false, false
	owner.call("PUT", "/api/v1/users/me", profile, 200)
	hidden := decoded[models.SocialUser](t, visitor.call("GET", "/api/v1/users/dummy-id", nil, 200))
	if hidden.BirthDate != "" || hidden.Gender != "" {
		t.Fatalf("a switch that is off still published the field: %+v", hidden)
	}
	if mine := decoded[models.SocialUser](t, owner.call("GET", "/api/v1/users/me", nil, 200)); mine.BirthDate == "" || mine.Gender == "" {
		t.Fatalf("the owner must still read the fields they hid: %+v", mine)
	}

	profile.ShowGender = true
	owner.call("PUT", "/api/v1/users/me", profile, 200)
	back := decoded[models.SocialUser](t, visitor.call("GET", "/api/v1/users/dummy-id", nil, 200))
	if back.Gender == "" || back.BirthDate != "" {
		t.Fatalf("the two switches must act independently: %+v", back)
	}
}
