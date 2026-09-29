package user

import (
	"net/http"
	"net/mail"
	realtimeforum "social-network/backend"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type RegisterRequestDTO struct {
	// Nickname is optional. When it is blank the service generates a unique
	// handle, because user.nickName is NOT NULL UNIQUE and every /profile/{id}
	// link assumes one.
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

func validBirthDate(value string) bool {
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

// ValidatePassword applies the signup password rules to a new credential, so
// the register form and the change-password form cannot drift apart. An empty
// password is a bad request rather than a length failure, because a missing
// field is a different mistake from a too-short one.
func ValidatePassword(password, confirm string) error {
	if password == "" {
		return realtimeforum.ErrBadRequest
	}
	if password != confirm {
		return realtimeforum.ErrPasswordsDontMatch
	}
	if len(password) < 12 || len(password) > 64 {
		return realtimeforum.ErrPasswordLength
	}
	if !passwordStrength(password) {
		return realtimeforum.ErrInvalidPassForm
	}
	return nil
}

func (d *RegisterRequestDTO) ParseAndValidate(r *http.Request) error {
	rawNickname := strings.TrimSpace(r.FormValue("nickName"))
	nickname, nicknameErr := ValidateNickname(rawNickname)
	d.Nickname = nickname
	d.Email = strings.TrimSpace(strings.ToLower(r.FormValue("email")))
	d.FirstName = strings.TrimSpace(strings.ToLower(r.FormValue("firstName")))
	d.LastName = strings.TrimSpace(strings.ToLower(r.FormValue("lastName")))
	d.Password = strings.TrimSpace(r.FormValue("password"))
	d.ConfirmPassword = strings.TrimSpace(r.FormValue("confirmPassword"))
	d.BirthDate = strings.TrimSpace(r.FormValue("birthDate"))
	d.Gender = strings.TrimSpace(strings.ToLower(r.FormValue("gender")))
	d.Bio = strings.TrimSpace(r.FormValue("aboutMe"))
	// A missing isPublic keeps the historical public default, so a client that
	// does not know about the choice behaves exactly as before.
	publicChoice := strings.TrimSpace(strings.ToLower(r.FormValue("isPublic")))
	d.IsPublic = publicChoice == "" || publicChoice == "true" || publicChoice == "on"

	// Only a nickname the visitor actually typed has to be valid.
	if rawNickname != "" && nicknameErr != nil {
		return nicknameErr
	}

	if d.Email == "" || d.FirstName == "" || d.LastName == "" ||
		d.Password == "" || d.ConfirmPassword == "" || d.BirthDate == "" || d.Gender == "" {
		return realtimeforum.ErrBadRequest
	}

	if !isASCIIPrintable(d.FirstName) || !isASCIIPrintable(d.LastName) {
		return realtimeforum.ErrNonASCII
	}

	if utf8.RuneCountInString(d.Bio) > 1000 {
		return realtimeforum.ErrBadRequest
	}

	if len(d.FirstName) < 1 || len(d.FirstName) > 50 {
		return realtimeforum.ErrBadRequest
	}

	if len(d.LastName) < 1 || len(d.LastName) > 50 {
		return realtimeforum.ErrBadRequest
	}

	if _, err := mail.ParseAddress(d.Email); err != nil {
		return realtimeforum.ErrInvalidEmail
	}

	if err := ValidatePassword(d.Password, d.ConfirmPassword); err != nil {
		return err
	}

	if !validBirthDate(d.BirthDate) {
		return realtimeforum.ErrInvalidBirthDate
	}

	if d.Gender != "male" && d.Gender != "female" {
		return realtimeforum.ErrGender
	}

	return nil
}
