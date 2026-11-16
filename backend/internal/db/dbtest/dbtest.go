// Package dbtest gives tests in any package a fresh, migrated database.
package dbtest

import (
	"path/filepath"
	"testing"

	"ehedges.net/ccgui/backend/internal/db"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Open returns a migrated database in a fresh temp dir, opened through
// db.OpenSqliteDB so tests get the production connection settings. It is closed
// when the test ends. GORM's own logging is silenced; errors are still returned.
func Open(t testing.TB) *gorm.DB {
	t.Helper()
	gdb, err := db.OpenSqliteDB(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	sqlDB, err := gdb.DB()
	if err != nil {
		t.Fatalf("test database handle: %v", err)
	}
	t.Cleanup(func() { sqlDB.Close() })
	return gdb.Session(&gorm.Session{Logger: logger.Discard})
}
