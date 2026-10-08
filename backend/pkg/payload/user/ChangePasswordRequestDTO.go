package user

import (
	realtimeforum "social-network/backend"
	"strings"
)

type ChangePasswordRequestDTO struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
	ConfirmPassword string `json:"confirmPassword"`
}

func (d *ChangePasswordRequestDTO) Validate() error {
	d.CurrentPassword = strings.TrimSpace(d.CurrentPassword)
	d.NewPassword = strings.TrimSpace(d.NewPassword)
	d.ConfirmPassword = strings.TrimSpace(d.ConfirmPassword)

	if d.CurrentPassword == "" {
		return realtimeforum.ErrBadRequest
	}
	return ValidatePassword(d.NewPassword, d.ConfirmPassword)
}
