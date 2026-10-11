package user

import (
	"net/http"
	realtimeforum "social-network/backend"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type RegisterRequestDTO struct {
	Nickname        string
	Email           string
	FirstName       string
	LastName        string
	Password        string
	ConfirmPassword string
	BirthDate       string
	Gender          string
	Bio             string
	IsPublic        bool
}

func isASCIIPrintable(s string) bool {
	for _, r := range s {
		if r < 0x20 || r > 0x7E {
			return false
		}
	}
	return true
}

func passwordStrength(password string) bool {
	var hasLetter, hasNumber, hasSymbol bool
	for _, ch := range password {
		switch {
		case unicode.IsLetter(ch):
			hasLetter = true
		case unicode.IsNumber(ch):
			hasNumber = true
		case unicode.IsSymbol(ch) || unicode.IsPunct(ch):
			hasSymbol = true
		}
	}
	return hasLetter && hasNumber && hasSymbol
}

// An address has to have a local part, a dot-separated domain and an alphabetic
// top-level label. The local part is held to the characters ordinary addresses are
// written with — letters, digits and . _ % + ' - — so the punctuation that used to
// slip through a name@host check (@ < > / \ and the rest) is refused outright. The
// shape is verified; the mailbox is not, because the demo fixtures sign in as
// @example.com and a DNS or MX lookup would refuse accounts the project hands out.
var emailPattern = regexp.MustCompile(`^[A-Za-z0-9._%+'-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$`)

// Letters, with apostrophes, hyphens and dots between them — the shapes real names
// take ("O'Brien", "Anne-Marie", "J.R"). Case is the author's: only the handle is
// folded to lower case, because a handle is matched on. Spaces are refused as well
// as the punctuation a form used to swallow (@ < > / \).
var namePattern = regexp.MustCompile(`^[A-Za-z]+(?:['\-.][A-Za-z]+)*$`)

func ValidateEmail(value string) (string, error) {
	email := strings.TrimSpace(strings.ToLower(value))
	if len(email) > 254 || !emailPattern.MatchString(email) {
		return "", realtimeforum.ErrInvalidEmail
	}
	if strings.Contains(email, "..") || strings.HasPrefix(email, ".") || strings.Contains(email, ".@") {
		return "", realtimeforum.ErrInvalidEmail
	}
	return email, nil
}

// ValidateName expects the value already trimmed, so one rule covers registration
// and the profile form. The name keeps whatever case it was typed in.
func ValidateName(value string) error {
	if len(value) < 1 || len(value) > 50 {
		return realtimeforum.ErrNameLength
	}
	if !namePattern.MatchString(value) {
		return realtimeforum.ErrNameCharacters
	}
	return nil
}

func ValidateNickname(value string) (string, error) {
	nickname := strings.TrimSpace(strings.ToLower(value))
	if !isASCIIPrintable(nickname) || len(nickname) < 2 || len(nickname) > 33 {
		return "", realtimeforum.ErrNickNameLength
	}
	for _, ch := range nickname {
		if (ch < 'a' || ch > 'z') && (ch < '0' || ch > '9') && ch != '_' {
			return "", realtimeforum.ErrBadRequest
		}
	}
	return nickname, nil
}

// ValidBirthDate is the one age rule the API applies, shared by registration and
// the edit dialog: a real date, not in the future, for a member aged 13 to 100.
func ValidBirthDate(value string) bool {
	birthDate, err := time.Parse("2006-01-02", value)
	if err != nil || birthDate.After(time.Now().UTC()) {
		return false
	}
	now := time.Now().UTC()
	age := now.Year() - birthDate.Year()
	birthday := time.Date(now.Year(), birthDate.Month(), birthDate.Day(), 0, 0, 0, 0, time.UTC)
	if now.Before(birthday) {
		age--
	}
	return age >= 13 && age <= 100
}

func ValidatePassword(password, confirm string) error {
	if password == "" {
		return realtimeforum.ErrBadRequest
	}
	if password != confirm {
		return realtimeforum.ErrPasswordsDontMatch
	}
	// Length and character rules are reported together: telling the user about
	// the 12-character minimum first and the symbol rule only after they fix it
	// makes them discover the requirement one rejected attempt at a time.
	if len(password) < 12 || len(password) > 64 || !passwordStrength(password) {
		return realtimeforum.ErrPasswordRequirements
	}
	return nil
}

func (d *RegisterRequestDTO) ParseAndValidate(r *http.Request) error {
	rawNickname := strings.TrimSpace(r.FormValue("nickName"))
	nickname, nicknameErr := ValidateNickname(rawNickname)
	d.Nickname = nickname
	email, emailErr := ValidateEmail(r.FormValue("email"))
	d.Email = email
	d.FirstName = strings.TrimSpace(r.FormValue("firstName"))
	d.LastName = strings.TrimSpace(r.FormValue("lastName"))
	d.Password = strings.TrimSpace(r.FormValue("password"))
	d.ConfirmPassword = strings.TrimSpace(r.FormValue("confirmPassword"))
	d.BirthDate = strings.TrimSpace(r.FormValue("birthDate"))
	d.Gender = strings.TrimSpace(strings.ToLower(r.FormValue("gender")))
	d.Bio = strings.TrimSpace(r.FormValue("aboutMe"))
	publicChoice := strings.TrimSpace(strings.ToLower(r.FormValue("isPublic")))
	d.IsPublic = publicChoice == "" || publicChoice == "true" || publicChoice == "on"

	if rawNickname != "" && nicknameErr != nil {
		return nicknameErr
	}

	if emailErr != nil {
		return emailErr
	}

	if d.FirstName == "" || d.LastName == "" ||
		d.Password == "" || d.ConfirmPassword == "" || d.BirthDate == "" || d.Gender == "" {
		return realtimeforum.ErrBadRequest
	}

	if !isASCIIPrintable(d.FirstName) || !isASCIIPrintable(d.LastName) {
		return realtimeforum.ErrNonASCII
	}

	if utf8.RuneCountInString(d.Bio) > 1000 {
		return realtimeforum.ErrAboutLength
	}

	// Each field reports what is wrong with it rather than one shared "bad
	// request", so the form can say which rule was broken.
	for _, name := range []string{d.FirstName, d.LastName} {
		if err := ValidateName(name); err != nil {
			return err
		}
	}

	if err := ValidatePassword(d.Password, d.ConfirmPassword); err != nil {
		return err
	}

	if !ValidBirthDate(d.BirthDate) {
		return realtimeforum.ErrInvalidBirthDate
	}

	if d.Gender != "male" && d.Gender != "female" {
		return realtimeforum.ErrGender
	}

	return nil
}
