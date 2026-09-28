package models

// Registration is everything a new account is created from. The optional profile
// fields travel with it so signup persists them in the same insert, instead of
// leaving a window where the account exists with a default profile.
type Registration struct {
	UserID       string
	Nickname     string
	FirstName    string
	LastName     string
	Email        string
	PasswordHash string
	BirthDate    string
	BirthYear    int
	Gender       string
	Bio          string
	IsPublic     bool
}
