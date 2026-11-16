package auth

import (
	"errors"
	"testing"
	"time"

	"ehedges.net/ccgui/backend/internal/accounts"
	"ehedges.net/ccgui/backend/internal/db"
	"ehedges.net/ccgui/backend/internal/db/dbtest"
	"gorm.io/gorm"
)

var fixedNow = time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)

func newSessionService(t *testing.T) (*Service, *accounts.Service, *gorm.DB) {
	t.Helper()
	gdb := dbtest.Open(t)
	acc := accounts.New(gdb)
	return New(gdb, acc, func() time.Time { return fixedNow }), acc, gdb
}

func mustCreateUser(t *testing.T, acc *accounts.Service, name string) *db.Account {
	t.Helper()
	user, err := acc.CreateUser(t.Context(), name)
	if err != nil {
		t.Fatal(err)
	}
	return user
}

func countRows[T any](t *testing.T, gdb *gorm.DB) int64 {
	t.Helper()
	var n int64
	if err := gdb.Model(new(T)).Count(&n).Error; err != nil {
		t.Fatal(err)
	}
	return n
}

func TestStartSessionCreatesFamilyAndPair(t *testing.T) {
	svc, acc, gdb := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")

	tokens, err := svc.StartSession(t.Context(), user.ID, nil)
	if err != nil {
		t.Fatalf("StartSession: %v", err)
	}
	wantExpiry := fixedNow.Add(accessTokenTTL)
	if !tokens.AccessTokenExpiry.Equal(wantExpiry) {
		t.Errorf("returned expiry %v, want %v", tokens.AccessTokenExpiry, wantExpiry)
	}

	var families []db.RefreshFamily
	if err := gdb.Find(&families).Error; err != nil {
		t.Fatal(err)
	}
	if len(families) != 1 {
		t.Fatalf("%d refresh families, want 1", len(families))
	}
	family := families[0]
	if family.AccountID != user.ID || family.BoundIP != nil || !family.CreatedAt.Equal(fixedNow) {
		t.Errorf("family = %+v, want account %s, no bound IP, created at %v", family, user.ID, fixedNow)
	}

	var refreshTokens []db.RefreshToken
	if err := gdb.Find(&refreshTokens).Error; err != nil {
		t.Fatal(err)
	}
	if len(refreshTokens) != 1 {
		t.Fatalf("%d refresh tokens, want 1", len(refreshTokens))
	}
	rt := refreshTokens[0]
	if rt.FamilyID != family.ID || rt.Generation != 0 || rt.ParentID != nil || rt.State != db.RefreshTokenIssued || !rt.IssuedAt.Equal(fixedNow) {
		t.Errorf("refresh token = %+v, want generation 0, issued, no parent, in family %s, issued at %v", rt, family.ID, fixedNow)
	}
	if rt.Hash != hashToken(tokens.RefreshToken) || rt.Hash == tokens.RefreshToken {
		t.Error("stored refresh token is not the hash of the returned token")
	}

	var accessTokens []db.AccessToken
	if err := gdb.Find(&accessTokens).Error; err != nil {
		t.Fatal(err)
	}
	if len(accessTokens) != 1 {
		t.Fatalf("%d access tokens, want 1", len(accessTokens))
	}
	at := accessTokens[0]
	if at.AccountID != user.ID || at.IssuedByRefreshID != rt.ID || !at.ExpiresAt.Equal(wantExpiry) || !at.CreatedAt.Equal(fixedNow) {
		t.Errorf("access token = %+v, want account %s, paired with refresh token %s, expiring %v", at, user.ID, rt.ID, wantExpiry)
	}
	if at.Hash != hashToken(tokens.AccessToken) || at.Hash == tokens.AccessToken {
		t.Error("stored access token is not the hash of the returned token")
	}
	if at.FirstUsedAt != nil || at.RevokedAt != nil {
		t.Errorf("new access token already used or revoked: %+v", at)
	}
}

func TestStartSessionBindsIP(t *testing.T) {
	svc, acc, gdb := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	ip := "203.0.113.7"

	if _, err := svc.StartSession(t.Context(), user.ID, &ip); err != nil {
		t.Fatalf("StartSession: %v", err)
	}
	var family db.RefreshFamily
	if err := gdb.First(&family).Error; err != nil {
		t.Fatal(err)
	}
	if family.BoundIP == nil || *family.BoundIP != ip {
		t.Fatalf("BoundIP = %v, want %q", family.BoundIP, ip)
	}
}

func TestStartSessionRejectsUnusableAccounts(t *testing.T) {
	svc, acc, gdb := newSessionService(t)
	disabled := mustCreateUser(t, acc, "disabled-user")
	if err := acc.DisableAccount(t.Context(), disabled.ID); err != nil {
		t.Fatal(err)
	}

	cases := map[string]struct {
		accountID string
		want      error
	}{
		"disabled account": {disabled.ID, ErrAccountDisabled},
		"missing account":  {"no-such-account", accounts.ErrNotFound},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			tokens, err := svc.StartSession(t.Context(), c.accountID, nil)
			if !errors.Is(err, c.want) || tokens != nil {
				t.Fatalf("got %v, %v; want nil, %v", tokens, err, c.want)
			}
		})
	}
	if n := countRows[db.RefreshFamily](t, gdb); n != 0 {
		t.Fatalf("%d refresh families after rejected sessions, want 0", n)
	}
}

// Enrollment will start a session inside its own transaction; a rollback there
// must also undo the session.
func TestStartSessionRollsBackWithOuterTransaction(t *testing.T) {
	svc, acc, gdb := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	errOuter := errors.New("outer step failed")

	err := gdb.Transaction(func(tx *gorm.DB) error {
		if _, err := svc.WithTx(tx).StartSession(t.Context(), user.ID, nil); err != nil {
			return err
		}
		return errOuter
	})
	if !errors.Is(err, errOuter) {
		t.Fatalf("got %v, want the outer error", err)
	}
	for name, n := range map[string]int64{
		"refresh families": countRows[db.RefreshFamily](t, gdb),
		"refresh tokens":   countRows[db.RefreshToken](t, gdb),
		"access tokens":    countRows[db.AccessToken](t, gdb),
	} {
		if n != 0 {
			t.Errorf("%d %s after the outer transaction rolled back, want 0", n, name)
		}
	}
}
