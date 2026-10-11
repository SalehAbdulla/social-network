package user

import (
	"errors"
	"testing"

	realtimeforum "social-network/backend"
)

func TestValidateEmailShape(t *testing.T) {
	valid := []string{
		"dummy@example.com",
		"alex.demo+tag@mail.example.co.uk",
		"o'brien@example.org",
		"a_b-1@sub.domain.io",
	}
	for _, value := range valid {
		if _, err := ValidateEmail(value); err != nil {
			t.Fatalf("%q should be accepted, got %v", value, err)
		}
	}

	// The forbidden characters the form used to swallow, and the shapes that are
	// not an address at all.
	invalid := []string{
		"", " ", "plainaddress", "mohd@", "@example.com", "mohd@example",
		"mohd@.com", "mohd@example.", "mohd@@example.com", "mohd@example..com",
		"mo<hd@example.com", "mohd>@example.com", "mohd/@example.com",
		"mohd\\@example.com", "mohd@exam ple.com", "mohd@example.c",
		"mohd@example.com/", "a b@example.com",
	}
	for _, value := range invalid {
		if _, err := ValidateEmail(value); !errors.Is(err, realtimeforum.ErrInvalidEmail) {
			t.Fatalf("%q should be refused, got %v", value, err)
		}
	}

	normalized, err := ValidateEmail("  MoHd@Example.COM ")
	if err != nil || normalized != "mohd@example.com" {
		t.Fatalf("the address was not normalised: %q %v", normalized, err)
	}
}

func TestValidateNameCharacters(t *testing.T) {
	valid := []string{"nora", "o'brien", "anne-marie", "j.r", "l", "Nora", "O'Brien", "Anne-Marie"}
	for _, value := range valid {
		if err := ValidateName(value); err != nil {
			t.Fatalf("%q should be accepted, got %v", value, err)
		}
	}

	invalid := []string{
		"", " ", "mo@med", "mo<med", "mo>med", "mo/med", "mo\\med",
		"mo med", "mo  med", "mo med ", "1st", "mo_med", "mo.med.", "mo'med'", "van der berg",
	}
	for _, value := range invalid {
		if err := ValidateName(value); err == nil {
			t.Fatalf("%q should be refused", value)
		}
	}
}
