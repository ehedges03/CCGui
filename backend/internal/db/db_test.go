package db_test

import (
	"context"
	"database/sql"
	"errors"
	"go/ast"
	"go/parser"
	"go/token"
	"go/types"
	"strconv"
	"strings"
	"testing"
	"time"

	"ehedges.net/ccgui/backend/internal/db"
	"ehedges.net/ccgui/backend/internal/db/dbtest"
	"gorm.io/gorm"
)

func TestConnectionSettings(t *testing.T) {
	gdb := dbtest.Open(t)
	sqlDB, err := gdb.DB()
	if err != nil {
		t.Fatal(err)
	}

	// Hold every connection open at once; releasing one before taking the next
	// would hand back the same pooled connection each time.
	ctx := context.Background()
	conns := make([]*sql.Conn, 3)
	for i := range conns {
		conn, err := sqlDB.Conn(ctx)
		if err != nil {
			t.Fatalf("conn %d: %v", i, err)
		}
		defer conn.Close()
		conns[i] = conn
	}

	for i, conn := range conns {
		var foreignKeys, busyTimeout int
		var journalMode string
		if err := conn.QueryRowContext(ctx, "PRAGMA foreign_keys").Scan(&foreignKeys); err != nil {
			t.Fatal(err)
		}
		if err := conn.QueryRowContext(ctx, "PRAGMA journal_mode").Scan(&journalMode); err != nil {
			t.Fatal(err)
		}
		if err := conn.QueryRowContext(ctx, "PRAGMA busy_timeout").Scan(&busyTimeout); err != nil {
			t.Fatal(err)
		}
		if foreignKeys != 1 {
			t.Errorf("conn %d: foreign_keys = %d, want 1", i, foreignKeys)
		}
		if journalMode != "wal" {
			t.Errorf("conn %d: journal_mode = %q, want \"wal\"", i, journalMode)
		}
		if busyTimeout != 5000 {
			t.Errorf("conn %d: busy_timeout = %d, want 5000", i, busyTimeout)
		}
	}
}

func TestForeignKeysEnforced(t *testing.T) {
	gdb := dbtest.Open(t)

	err := gdb.Create(&db.RefreshToken{
		FamilyID: "no-such-family",
		Hash:     "h",
		State:    db.RefreshTokenIssued,
		IssuedAt: time.Now(),
	}).Error
	if err == nil {
		t.Fatal("insert with a dangling family_id succeeded, want a foreign key error")
	}
	if !errors.Is(err, gorm.ErrForeignKeyViolated) {
		t.Fatalf("got %v, want a foreign key error", err)
	}
}

func TestTimesStoredInUTC(t *testing.T) {
	// Force a non-UTC local zone so the test fails on any machine if OpenDB
	// stops storing UTC (GORM's default timestamps use local time).
	previous := time.Local
	time.Local = time.FixedZone("UTC-5", -5*60*60)
	t.Cleanup(func() { time.Local = previous })

	gdb := dbtest.Open(t)
	account := db.Account{Kind: db.AccountKindUser, Name: "utc-check"}
	if err := gdb.Create(&account).Error; err != nil {
		t.Fatal(err)
	}

	// Read the stored text: scanning into time.Time would hide the stored offset.
	var stored string
	if err := gdb.Raw("SELECT created_at FROM accounts WHERE id = ?", account.ID).Scan(&stored).Error; err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(stored, "Z") {
		t.Fatalf("created_at stored as %q, want a UTC value ending in Z", stored)
	}
}

// TestEveryModelMigrated reads models.go as source, collects the table name each
// TableName() returns, and checks a migrated database has every one of them.
// Fails when a model is added to models.go but not to autoMigrate.
func TestEveryModelMigrated(t *testing.T) {
	file, err := parser.ParseFile(token.NewFileSet(), "models.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}

	var tables []string
	for _, decl := range file.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Recv == nil || fn.Name.Name != "TableName" {
			continue
		}
		table, ok := returnedString(fn)
		if !ok {
			t.Fatalf("%s.TableName() must be a single `return \"name\"` for this test to read it", types.ExprString(fn.Recv.List[0].Type))
		}
		tables = append(tables, table)
	}
	if len(tables) == 0 {
		t.Fatal("found no TableName() methods in models.go")
	}

	gdb := dbtest.Open(t)
	for _, table := range tables {
		if !gdb.Migrator().HasTable(table) {
			t.Errorf("models.go defines table %q but it was not migrated", table)
		}
	}
}

// returnedString extracts "name" from a function body of exactly `return "name"`.
func returnedString(fn *ast.FuncDecl) (string, bool) {
	if fn.Body == nil || len(fn.Body.List) != 1 {
		return "", false
	}
	ret, ok := fn.Body.List[0].(*ast.ReturnStmt)
	if !ok || len(ret.Results) != 1 {
		return "", false
	}
	lit, ok := ret.Results[0].(*ast.BasicLit)
	if !ok || lit.Kind != token.STRING {
		return "", false
	}
	value, err := strconv.Unquote(lit.Value)
	return value, err == nil
}
