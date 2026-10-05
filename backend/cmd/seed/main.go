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
	"social-network/backend/pkg/models"
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
		// A story that has already expired, so the author's archive has something in it: a fresh
		// database can never pass a story's own 24-hour life inside a run, and the archive is a
		// surface that shows nothing without one.
		if err := seedArchivedStory(&repositories.DB{Conn: database}, userID); err != nil {
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

// The content of the demo's expired story. The browser suite reads the archive back by this
// string, the way it reads the seeded handles, so it is written down here rather than buried in
// the INSERT that uses it.
const archivedStoryContent = "From yesterday, kept in the archive"

// seedArchivedStory leaves one expired story for the demo user, so the story archive is not empty
// on a fresh database — nothing can pass a story's real 24-hour expiry inside a test run. It is
// idempotent: a second run finds the story already there and leaves it.
func seedArchivedStory(database *repositories.DB, userID string) error {
	var existing int
	if err := database.Conn.QueryRow("SELECT COUNT(*) FROM story WHERE userId=? AND expiresAt <= datetime('now')", userID).Scan(&existing); err != nil {
		return err
	}
	if existing > 0 {
		return nil
	}
	_, err := database.Conn.Exec(`INSERT INTO story (userId, content, mediaType, backgroundColor, createdAt, expiresAt)
		VALUES (?, ?, 'text', '#4f46e5', datetime('now','-2 days'), datetime('now','-1 day'))`, userID, archivedStoryContent)
	return err
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
	if err := database.InsertUser(models.Registration{
		UserID: userID, Nickname: nickname, FirstName: firstName, LastName: lastName, Email: email,
		PasswordHash: string(hashedPassword), BirthDate: "2000-01-01", BirthYear: 2000, Gender: "male", IsPublic: true,
	}); err != nil {
		return "", false, fmt.Errorf("create dummy user: %w", err)
	}
	return userID, true, nil
}
