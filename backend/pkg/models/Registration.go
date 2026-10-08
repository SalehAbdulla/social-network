package models

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
