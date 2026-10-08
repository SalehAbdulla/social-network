package user

import (
	realtimeforum "social-network/backend"
	"strings"
)

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

type PasswordResetConfirmDTO struct {
	Token           string `json:"token"`
	Password        string `json:"password"`
	ConfirmPassword string `json:"confirmPassword"`
}

func (d *PasswordResetConfirmDTO) Validate() error {
	d.Token = strings.TrimSpace(d.Token)
	d.Password = strings.TrimSpace(d.Password)
	d.ConfirmPassword = strings.TrimSpace(d.ConfirmPassword)

	if d.Token == "" {
		return realtimeforum.ErrInvalidResetToken
	}
	return ValidatePassword(d.Password, d.ConfirmPassword)
}
