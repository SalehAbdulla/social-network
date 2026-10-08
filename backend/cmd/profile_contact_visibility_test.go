package main

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
