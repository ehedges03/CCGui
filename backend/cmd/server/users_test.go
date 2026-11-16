package main

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

func newAuthService(t *testing.T) (*auth.Service, *gorm.DB) {
	t.Helper()
	gdb := dbtest.Open(t)
	return auth.New(gdb, accounts.New(gdb)), gdb
}

func TestCreateUserFromInputPromptsForEverything(t *testing.T) {
	svc, _ := newAuthService(t)
	p, out := testPrompter("foo-user\nfoouser\nsecret-pass\n")

	account, err := createUserFromInput(t.Context(), svc, p, "", "")
	if err != nil {
		t.Fatalf("createUserFromInput: %v", err)
	}
	if account.Name != "foo-user" {
		t.Errorf("account name = %q, want %q", account.Name, "foo-user")
	}
	for _, prompt := range []string{"Name: ", "Username: ", "Password: "} {
		if !strings.Contains(out.String(), prompt) {
			t.Errorf("output %q is missing prompt %q", out.String(), prompt)
		}
	}
}

func TestCreateUserFromInputFlagsSkipPrompts(t *testing.T) {
	svc, _ := newAuthService(t)
	p, out := testPrompter("secret-pass\n")

	if _, err := createUserFromInput(t.Context(), svc, p, "foo-user", "foouser"); err != nil {
		t.Fatalf("createUserFromInput: %v", err)
	}
	if strings.Contains(out.String(), "Name: ") || strings.Contains(out.String(), "Username: ") {
		t.Errorf("prompted for a value given as a flag: %q", out.String())
	}
}

func TestCreateUserFromInputNoFinalNewline(t *testing.T) {
	svc, _ := newAuthService(t)
	p, _ := testPrompter("foo-user\nfoouser\nsecret-pass")

	if _, err := createUserFromInput(t.Context(), svc, p, "", ""); err != nil {
		t.Fatalf("input without a final newline: %v", err)
	}
}

func TestCreateUserFromInputEmptyInput(t *testing.T) {
	svc, gdb := newAuthService(t)
	p, _ := testPrompter("")

	_, err := createUserFromInput(t.Context(), svc, p, "", "")
	if err == nil || !strings.Contains(err.Error(), "read name") {
		t.Fatalf("got %v, want a read name error", err)
	}
	var n int64
	if err := gdb.Model(&db.Account{}).Count(&n).Error; err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("%d accounts exist after empty input, want 0", n)
	}
}

func TestCreateUserFromInputDuplicateUsername(t *testing.T) {
	svc, _ := newAuthService(t)
	first, _ := testPrompter("secret-pass\n")
	if _, err := createUserFromInput(t.Context(), svc, first, "foo-user", "foouser"); err != nil {
		t.Fatal(err)
	}

	second, _ := testPrompter("secret-pass\n")
	_, err := createUserFromInput(t.Context(), svc, second, "bar-user", "FooUser")
	if !errors.Is(err, auth.ErrUsernameTaken) {
		t.Fatalf("got %v, want ErrUsernameTaken", err)
	}
}
