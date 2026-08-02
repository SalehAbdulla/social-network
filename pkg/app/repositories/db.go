package repositories

import (
	"database/sql"
	_ "embed"
)

//go:embed schema.sql
var schemaSQL string

//go:embed seed.sql
var seedSQL string

type DB struct {
	Conn *sql.DB
}

func RunMigrations(conn *sql.DB) error {
	var count int
	err := conn.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='user'").Scan(&count)
	if err != nil {
		return err
	}

	if count > 0 {
		return nil
	}

	_, err = conn.Exec(schemaSQL)
	if err != nil {
		return err
	}

	_, err = conn.Exec(seedSQL)
	return err
}
