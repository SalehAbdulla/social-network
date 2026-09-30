package user

import (
	realtimeforum "social-network/backend"
	"strings"
)

// PasswordResetRequestDTO is the body of POST /api/v1/auth/password-reset. The
// address is normalised the same way registration normalises it — trimmed and
// lowercased — because the lookup has to match what was stored.
type PasswordResetRequestDTO struct {
	Email string `json:"email"`
}

func (d *PasswordResetRequestDTO) Validate() error {
	d.Email = strings.TrimSpace(strings.ToLower(d.Email))
	if d.Email == "" || !strings.Contains(d.Email, "@") {
		return realtimeforum.ErrInvalidEmail
	}
	return nil
}

// PasswordResetConfirmDTO is the body of POST /api/v1/auth/password-reset/confirm.
// The token travels in the body rather than the URL, so it does not land in an
// access log or a `Referer` header; the link in the mail carries it in the query
// string only as far as the reset page, which then posts it here.
type PasswordResetConfirmDTO struct {
	Token           string `json:"token"`
	Password        string `json:"password"`
	ConfirmPassword string `json:"confirmPassword"`
}

// Validate trims the fields and applies the shared credential rules, so a reset
// cannot set a password the register form would have refused.
func (d *PasswordResetConfirmDTO) Validate() error {
	d.Token = strings.TrimSpace(d.Token)
	d.Password = strings.TrimSpace(d.Password)
	d.ConfirmPassword = strings.TrimSpace(d.ConfirmPassword)

	if d.Token == "" {
		return realtimeforum.ErrInvalidResetToken
	}
	return ValidatePassword(d.Password, d.ConfirmPassword)
}
