package user

import (
	realtimeforum "social-network/backend"
	"strings"
)

// ChangePasswordRequestDTO is the body of PUT /api/v1/users/me/password. It is
// JSON, like the endpoints added since the signup form, and it asks for the
// confirmation a second time so the server enforces the same match rule the
// register form relies on rather than trusting the dialog to have done it.
type ChangePasswordRequestDTO struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
	ConfirmPassword string `json:"confirmPassword"`
}

// Validate trims the fields in place and applies the shared credential rules.
// It does not check the current password: that needs the stored hash and so
// belongs to the service. Validation runs before the hash is compared, so a
// malformed body never costs a bcrypt round trip.
func (d *ChangePasswordRequestDTO) Validate() error {
	d.CurrentPassword = strings.TrimSpace(d.CurrentPassword)
	d.NewPassword = strings.TrimSpace(d.NewPassword)
	d.ConfirmPassword = strings.TrimSpace(d.ConfirmPassword)

	if d.CurrentPassword == "" {
		return realtimeforum.ErrBadRequest
	}
	return ValidatePassword(d.NewPassword, d.ConfirmPassword)
}
