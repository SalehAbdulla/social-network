package repositories

import (
	"database/sql"
)

type DB struct {
	Conn *sql.DB
}
