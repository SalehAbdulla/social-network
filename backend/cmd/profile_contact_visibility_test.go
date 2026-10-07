package main

import (
	"testing"

	"social-network/backend/pkg/models"
)

// TestProfileContactVisibility is the per-field counterpart of the profile mask. A member owns
// three optional contact fields — a website, an email and a phone — and a public switch for each,
// so a viewer who may see the profile is still shown only the fields whose switch its owner left
// on. The owner always reads the stored values back, which is what lets the edit form change them
// or turn a switch back on without first re-typing what was hidden.
func TestProfileContactVisibility(t *testing.T) {
	server, _ := integrationServer(t, true, false)
	alex, dummy := newIntegrationClient(t, server), newIntegrationClient(t, server)
	alex.login("alex@example.com")
	dummy.login("dummy@example.com")

	// Alex publishes all three, but leaves only the website on.
	profile := decoded[models.SocialUser](t, alex.call("GET", "/api/v1/users/me", nil, 200))
	profile.Website = "https://alex.example"
	profile.ContactEmail = "alex@example.com"
	profile.Phone = "+1 555 000 0000"
	profile.ShowWebsite = true
	profile.ShowContactEmail = false
	profile.ShowPhone = false
	alex.call("PUT", "/api/v1/users/me", profile, 200)

	// The owner keeps every value, and the switches come back with the profile.
	owner := decoded[models.SocialUser](t, alex.call("GET", "/api/v1/users/me", nil, 200))
	if owner.Website != "https://alex.example" || owner.ContactEmail != "alex@example.com" || owner.Phone != "+1 555 000 0000" {
		t.Fatalf("the owner lost a stored contact field: %+v", owner)
	}
	if !owner.ShowWebsite || owner.ShowContactEmail || owner.ShowPhone {
		t.Fatalf("the public switches did not survive the save: %+v", owner)
	}

	// Another member sees the website and neither of the fields switched off, while the rest of
	// the profile still reads — the switches hide a field, they do not lock the profile.
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

	// Turning the email back on republishes the value that was never cleared, and leaves the
	// phone — whose switch was not touched — off.
	owner.ShowContactEmail = true
	alex.call("PUT", "/api/v1/users/me", owner, 200)
	again := decoded[models.SocialUser](t, dummy.call("GET", "/api/v1/users/alex-id", nil, 200))
	if again.ContactEmail != "alex@example.com" {
		t.Fatalf("re-publishing the email lost the stored value: %q", again.ContactEmail)
	}
	if again.Phone != "" {
		t.Fatalf("an unrelated flip published the phone too: %q", again.Phone)
	}

	// The switches sit behind the profile's own visibility rather than beside it: once the profile
	// as a whole is out of reach, every contact field is blanked whether its switch is on or off.
	owner.IsPublic = false
	alex.call("PUT", "/api/v1/users/me", owner, 200)
	hidden := decoded[models.SocialUser](t, dummy.call("GET", "/api/v1/users/alex-id", nil, 200))
	if hidden.Website != "" || hidden.ContactEmail != "" || hidden.Phone != "" {
		t.Fatalf("a private profile leaked a contact field: %+v", hidden)
	}
}
