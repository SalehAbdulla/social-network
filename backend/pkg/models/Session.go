package models

import "time"

// Session is a persisted login token. createdAt bounds the absolute lifetime,
// lastSeenAt drives the shorter idle timeout.
type Session struct {
	Token      string    `json:"token"`
	UserID     string    `json:"userId"`
	CreatedAt  time.Time `json:"createdAt"`
	LastSeenAt time.Time `json:"lastSeenAt"`
	ExpiresAt  time.Time `json:"expiresAt"`
}
