package db

import (
	"log/slog"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func OpenSqliteDB(path string) (*gorm.DB, error) {
	return openDB(path + "?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000")
}

func openDB(path string) (*gorm.DB, error) {
	db, err := gorm.Open(
		sqlite.Open(path),
		&gorm.Config{
			// Times are compared as text in SQLite, so store them all in UTC.
			NowFunc: func() time.Time { return time.Now().UTC() },
		},
	)

	if err != nil {
		slog.Error("failed to open database", "err", err)
		return nil, err
	}

	err = autoMigrate(db)

	if err != nil {
		slog.Error("failed to migrate database", "err", err)
		return nil, err
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
