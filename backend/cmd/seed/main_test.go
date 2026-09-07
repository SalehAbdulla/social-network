package main

import (
	"database/sql"
	"errors"
	"testing"

	backend "social-network/backend"
	"social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/app/service"
	sqlitedb "social-network/backend/pkg/db/sqlite"
)

func TestSeedDummyUser(t *testing.T) {
	// Run the application's real migrations from the backend directory.
	t.Chdir("../..")
	database, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	database.SetMaxOpenConns(1)
	t.Cleanup(func() { database.Close() })
	if err := sqlitedb.RunMigrations(database); err != nil {
		t.Fatal(err)
	}

	repository := &repositories.DB{Conn: database}
	userID, created, err := seedDummyUser(repository)
	if err != nil || !created || userID == "" {
		t.Fatalf("seed user: id=%q, created=%v, err=%v", userID, created, err)
	}
	_, originalHash, err := repository.GetUserCredentials(dummyEmail)
	if err != nil {
		t.Fatal(err)
	}
	if originalHash == dummyPassword {
		t.Fatal("password must not be stored as plaintext")
	}

	secondID, created, err := seedDummyUser(repository)
	if err != nil || created || secondID != userID {
		t.Fatalf("repeat seed: id=%q, created=%v, err=%v", secondID, created, err)
	}
	_, currentHash, err := repository.GetUserCredentials(dummyEmail)
	if err != nil || currentHash != originalHash {
		t.Fatalf("repeat seed changed credentials: %v", err)
	}
	var count int
	if err := database.QueryRow("SELECT COUNT(*) FROM user").Scan(&count); err != nil || count != 1 {
		t.Fatalf("expected one user after repeated seeding, count=%d, err=%v", count, err)
	}

	auth := service.NewAuthService(repository)
	for _, identifier := range []string{dummyEmail, dummyNickname} {
		t.Run(identifier, func(t *testing.T) {
			loggedInID, token, err := auth.Login(identifier, dummyPassword)
			if err != nil || loggedInID != userID || token == "" {
				t.Fatalf("login: id=%q, token present=%v, err=%v", loggedInID, token != "", err)
			}
			t.Cleanup(func() { auth.Logout(token) })
			if sessionID, ok := service.DefaultSessionManager.GetUserIdByToken(token); !ok || sessionID != userID {
				t.Fatal("login did not create a usable session")
			}
		})
	}
	if _, _, err := auth.Login(dummyEmail, "wrong-password"); !errors.Is(err, backend.ErrInvalidCredentials) {
		t.Fatalf("expected invalid credentials for wrong password, got %v", err)
	}
	profile, err := auth.GetMe(userID)
	if err != nil || profile.Email != dummyEmail || profile.Nickname != dummyNickname || profile.FirstName != "Dummy" || profile.LastName != "User" {
		t.Fatalf("unexpected dummy profile: %+v, err=%v", profile, err)
	}
}
