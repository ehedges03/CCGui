package auth_test

import (
	"errors"
	"strings"
	"testing"

	"ehedges.net/ccgui/backend/internal/accounts"
	"ehedges.net/ccgui/backend/internal/auth"
	"ehedges.net/ccgui/backend/internal/db"
	"ehedges.net/ccgui/backend/internal/db/dbtest"
	"gorm.io/gorm"
)

func newServices(t *testing.T) (*auth.Service, *accounts.Service, *gorm.DB) {
	t.Helper()
	gdb := dbtest.Open(t)
	acc := accounts.New(gdb)
	return auth.New(gdb, acc), acc, gdb
}

func countAccounts(t *testing.T, gdb *gorm.DB) int64 {
	t.Helper()
	var n int64
	if err := gdb.Model(&db.Account{}).Count(&n).Error; err != nil {
		t.Fatal(err)
	}
	return n
}

func TestCreateUserWithPassword(t *testing.T) {
	svc, _, gdb := newServices(t)

	account, err := svc.CreateUserWithPassword(t.Context(), "foo-user", "FooUsername", "foo-password")
	if err != nil {
		t.Fatalf("CreateUserWithPassword: %v", err)
	}
	if account == nil || account.ID == "" || account.Kind != db.AccountKindUser {
		t.Fatalf("account = %+v, want a user account with an ID", account)
	}

	var stored db.Password
	if err := gdb.Where("account_id = ?", account.ID).First(&stored).Error; err != nil {
		t.Fatalf("load password row: %v", err)
	}
	if stored.Username != "foousername" {
		t.Errorf("username stored as %q, want it lowercased to %q", stored.Username, "foousername")
	}
	if !strings.HasPrefix(stored.PasswordHash, "$argon2id$") || strings.Contains(stored.PasswordHash, "foo-password") {
		t.Errorf("password stored as %q, want an argon2id hash without the plaintext", stored.PasswordHash)
	}
}

func TestCreateUserWithPasswordDuplicateUsername(t *testing.T) {
	svc, _, gdb := newServices(t)
	if _, err := svc.CreateUserWithPassword(t.Context(), "foo-user", "FooUsername", "foo-password"); err != nil {
		t.Fatal(err)
	}
	before := countAccounts(t, gdb)

	// Same username in different case must still collide.
	_, err := svc.CreateUserWithPassword(t.Context(), "someone-else", "foousername", "bar-password")
	if !errors.Is(err, auth.ErrUsernameTaken) {
		t.Fatalf("got %v, want ErrUsernameTaken", err)
	}
	if after := countAccounts(t, gdb); after != before {
		t.Fatalf("accounts went from %d to %d; the failed create must roll back its account", before, after)
	}
}

func TestCreateUserWithPasswordInvalidInputCreatesNothing(t *testing.T) {
	cases := []struct {
		name, accountName, username, password string
		want                                  error
	}{
		{"short username", "foo-user", "foo", "foo-password", auth.ErrInvalidUsername},
		{"short password", "foo-user", "foousername", "short", auth.ErrInvalidPassword},
		// The account name is checked inside the transaction, so this exercises the rollback.
		{"short account name", "foo", "foousername", "foo-password", accounts.ErrInvalidName},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			svc, _, gdb := newServices(t)
			_, err := svc.CreateUserWithPassword(t.Context(), c.accountName, c.username, c.password)
			if !errors.Is(err, c.want) {
				t.Fatalf("got %v, want %v", err, c.want)
			}
			if n := countAccounts(t, gdb); n != 0 {
				t.Fatalf("%d accounts exist after a rejected create, want 0", n)
			}
		})
	}
}

func TestCreatePasswordForExistingAccount(t *testing.T) {
	svc, acc, _ := newServices(t)
	first, err := acc.CreateUser(t.Context(), "first-user")
	if err != nil {
		t.Fatal(err)
	}
	second, err := acc.CreateUser(t.Context(), "second-user")
	if err != nil {
		t.Fatal(err)
	}

	p, err := svc.CreatePassword(t.Context(), first.ID, "FirstUser", "foo-password")
	if err != nil {
		t.Fatalf("CreatePassword: %v", err)
	}
	if p.AccountID != first.ID || p.Username != "firstuser" {
		t.Fatalf("password = %+v, want account %s and username %q", p, first.ID, "firstuser")
	}

	if _, err := svc.CreatePassword(t.Context(), second.ID, "firstuser", "foo-password"); !errors.Is(err, auth.ErrUsernameTaken) {
		t.Fatalf("reusing the username for another account: got %v, want ErrUsernameTaken", err)
	}

	// An account gets one username/password; a second one is rejected even with an unused username.
	if _, err := svc.CreatePassword(t.Context(), first.ID, "unusedname", "bar-password"); !errors.Is(err, auth.ErrUserAlreadyHasPassword) {
		t.Fatalf("second password for the same account: got %v, want ErrUserAlreadyHasPassword", err)
	}
}
