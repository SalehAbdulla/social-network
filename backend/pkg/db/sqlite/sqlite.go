package sqlite

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"social-network/backend/pkg/config"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/sqlite3"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

func RunMigrations(db *sql.DB) error {
	backendDir, err := config.BackendDir()
	if err != nil {
		return err
	}
	source, err := iofs.New(os.DirFS(filepath.Join(backendDir, "pkg", "db", "migrations", "sqlite")), ".")
	if err != nil {
		return fmt.Errorf("failed to open migration files: %w", err)
	}
	defer source.Close()

	driver, err := sqlite3.WithInstance(db, &sqlite3.Config{})
	if err != nil {
		return fmt.Errorf("failed to create migration driver: %w", err)
	}

	m, err := migrate.NewWithInstance(
		"iofs",
		source,
		"sqlite3",
		driver,
	)
	if err != nil {
		return fmt.Errorf("failed to create migration instance: %w", err)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	log.Println("Migrations applied successfully")
	return nil
}
