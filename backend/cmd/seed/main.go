// Command seed creates a local development user without starting the server.
package main

import (
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log"
	"path/filepath"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/crypto/bcrypt"

	backend "social-network/backend"
	"social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/config"
	sqlitedb "social-network/backend/pkg/db/sqlite"
)

const (
	dummyEmail    = "dummy@example.com"
	dummyNickname = "dummyuser"
	dummyPassword = "DummyUser123!"
)

func main() {
	demo := flag.Bool("demo", false, "also create Alex Demo for testing social features")
	flag.Parse()
	backendDir, err := config.BackendDir()
	if err != nil {
		log.Fatal(err)
	}
	database, err := sql.Open("sqlite3", filepath.Join(backendDir, "pkg", "db", "socialnetwork.db"))
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()

	if err := sqlitedb.RunMigrations(database); err != nil {
		log.Fatal(err)
	}

	userID, created, err := seedDummyUser(&repositories.DB{Conn: database})
	if err != nil {
		log.Fatal(err)
	}
	if *demo {
		if _, _, err := seedUser(&repositories.DB{Conn: database}, "alex@example.com", "alexdemo", "Alex", "Demo"); err != nil {
			log.Fatal(err)
		}
		fmt.Println("Alex Demo is ready (alex@example.com).")
	}
	if !created {
		fmt.Printf("Dummy user already exists: %s (userId: %s). Left unchanged.\n", dummyEmail, userID)
		return
	}

	fmt.Printf("Created local development user\nEmail: %s\nNickname: %s\nPassword: %s\nUser ID: %s\n", dummyEmail, dummyNickname, dummyPassword, userID)
}

func seedDummyUser(database *repositories.DB) (string, bool, error) {
	return seedUser(database, dummyEmail, dummyNickname, "Dummy", "User")
}

func seedUser(database *repositories.DB, email, nickname, firstName, lastName string) (string, bool, error) {
	userID, _, err := database.GetUserCredentials(email)
	if err == nil {
		return userID, false, nil
	}
	if !errors.Is(err, backend.ErrInvalidCredentials) {
		return "", false, fmt.Errorf("look up dummy user: %w", err)
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(dummyPassword), bcrypt.DefaultCost)
	if err != nil {
		return "", false, fmt.Errorf("hash dummy password: %w", err)
	}

	userID = uuid.NewString()
	if err := database.InsertUser(userID, nickname, firstName, lastName, email, string(hashedPassword), 2000, "male"); err != nil {
		return "", false, fmt.Errorf("create dummy user: %w", err)
	}
	return userID, true, nil
}
