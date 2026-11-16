package db

import (
	"fmt"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func OpenSqliteDB(path string) (*gorm.DB, error) {
	// DSN params apply to every pooled connection (a one-off PRAGMA would not).
	// WAL + busy_timeout let log ingestion and token rotation write concurrently.
	return openDB(sqlite.Open(path + "?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000"))
}

func openDB(dialector gorm.Dialector) (*gorm.DB, error) {
	db, err := gorm.Open(
		dialector,
		&gorm.Config{
			// Times are compared as text in SQLite, so store them all in UTC.
			NowFunc:        func() time.Time { return time.Now().UTC() },
			TranslateError: true,
		},
	)

	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	err = autoMigrate(db)

	if err != nil {
		return nil, fmt.Errorf("migrate database: %w", err)
	}

	return db, nil
}

func autoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(&Account{},
		&Computer{},
		&Password{},
		&UserAPIKey{},
		&RefreshFamily{},
		&RefreshToken{},
		&AccessToken{},
		&Enrollment{},
		&ClientLog{},
		&WSConnection{},
		&WSPush{},
		&SecurityEvent{},
		&Incident{},
		&IncidentBranch{},
	)
}
