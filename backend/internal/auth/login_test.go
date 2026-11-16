package auth

import (
	"errors"
	"testing"

	"ehedges.net/ccgui/backend/internal/db"
	"gorm.io/gorm"
)

func mustCreateUserWithPassword(t *testing.T, svc *Service, name, username, password string) *db.Account {
	t.Helper()
	user, err := svc.CreateUserWithPassword(t.Context(), name, username, password)
	if err != nil {
		t.Fatal(err)
	}
	return user
}

func mustStartSession(t *testing.T, svc *Service, accountID string) *IssuedTokens {
	t.Helper()
	tokens, err := svc.StartSession(t.Context(), accountID, nil)
	if err != nil {
		t.Fatal(err)
	}
	return tokens
}

func storedPasswordHash(t *testing.T, gdb *gorm.DB, accountID string) string {
	t.Helper()
	var p db.Password
	if err := gdb.First(&p, "account_id = ?", accountID).Error; err != nil {
		t.Fatal(err)
	}
	return p.PasswordHash
}

func TestTryLoginIgnoresUsernameCase(t *testing.T) {
	svc, _, _ := newSessionService(t)
	user := mustCreateUserWithPassword(t, svc, "foo-user", "FooUser", "secret-pass")

	for _, username := range []string{"foouser", "FOOUSER", "fOoUsEr"} {
		accountID, err := svc.TryLogin(t.Context(), username, "secret-pass")
		if err != nil {
			t.Fatalf("TryLogin(%q): %v", username, err)
		}
		if accountID != user.ID {
			t.Errorf("TryLogin(%q) = %q, want %q", username, accountID, user.ID)
		}
	}
}

func TestTryLoginRejectsBadCredentials(t *testing.T) {
	svc, _, _ := newSessionService(t)
	mustCreateUserWithPassword(t, svc, "foo-user", "foouser", "secret-pass")

	cases := map[string]struct {
		username, password string
		want               error
	}{
		"wrong password":   {"foouser", "wrong-pass", ErrIncorrectPassword},
		"empty password":   {"foouser", "", ErrIncorrectPassword},
		"unknown username": {"baruser", "secret-pass", ErrIncorrectUsername},
		"empty username":   {"", "secret-pass", ErrIncorrectUsername},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			accountID, err := svc.TryLogin(t.Context(), c.username, c.password)
			if !errors.Is(err, c.want) || accountID != "" {
				t.Fatalf("got %q, %v; want \"\", %v", accountID, err, c.want)
			}
		})
	}
}

func TestTryLoginMalformedStoredHash(t *testing.T) {
	svc, acc, gdb := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	if err := gdb.Create(&db.Password{AccountID: user.ID, Username: "foouser", PasswordHash: "not-a-hash"}).Error; err != nil {
		t.Fatal(err)
	}

	_, err := svc.TryLogin(t.Context(), "foouser", "secret-pass")
	if !errors.Is(err, ErrMalformedHash) {
		t.Fatalf("got %v, want ErrMalformedHash", err)
	}
}

func TestTryLoginRehashesOutdatedParams(t *testing.T) {
	svc, _, gdb := newSessionService(t)

	// Hash the password with different params, as if currentParams had since changed.
	saved := currentParams
	currentParams = hashParams{memory: 32 * 1024, time: 2, threads: 2, saltLen: 16, keyLen: 32}
	user := mustCreateUserWithPassword(t, svc, "foo-user", "foouser", "secret-pass")
	currentParams = saved
	oldHash := storedPasswordHash(t, gdb, user.ID)

	if _, err := svc.TryLogin(t.Context(), "foouser", "secret-pass"); err != nil {
		t.Fatalf("TryLogin: %v", err)
	}

	newHash := storedPasswordHash(t, gdb, user.ID)
	if newHash == oldHash {
		t.Fatal("stored hash was not replaced")
	}
	params, _, err := parseEncodedHash(newHash)
	if err != nil {
		t.Fatal(err)
	}
	if needRehash(params) {
		t.Errorf("rehashed with %+v, want currentParams %+v", *params, currentParams)
	}
	if _, err := svc.TryLogin(t.Context(), "foouser", "secret-pass"); err != nil {
		t.Fatalf("TryLogin after rehash: %v", err)
	}
}

func TestTryLoginKeepsCurrentHash(t *testing.T) {
	svc, _, gdb := newSessionService(t)
	user := mustCreateUserWithPassword(t, svc, "foo-user", "foouser", "secret-pass")
	before := storedPasswordHash(t, gdb, user.ID)

	if _, err := svc.TryLogin(t.Context(), "foouser", "secret-pass"); err != nil {
		t.Fatalf("TryLogin: %v", err)
	}
	if after := storedPasswordHash(t, gdb, user.ID); after != before {
		t.Error("hash with current params was rewritten")
	}
}

func TestEndSessionRevokesWholeFamily(t *testing.T) {
	svc, acc, gdb := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	ended := mustStartSession(t, svc, user.ID)
	other := mustStartSession(t, svc, user.ID)

	if err := svc.EndSession(t.Context(), ended.RefreshToken, "logout"); err != nil {
		t.Fatalf("EndSession: %v", err)
	}

	endedRT, err := gorm.G[db.RefreshToken](gdb).Preload("Family", nil).Where("hash = ?", hashToken(ended.RefreshToken)).First(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	family := endedRT.Family
	if family.RevokedAt == nil || !family.RevokedAt.Equal(fixedNow) || family.RevokeReason == nil || *family.RevokeReason != "logout" {
		t.Errorf("family revoked at %v for %v, want %v for \"logout\"", family.RevokedAt, family.RevokeReason, fixedNow)
	}
	if endedRT.State != db.RefreshTokenDead {
		t.Errorf("refresh token state = %q, want %q", endedRT.State, db.RefreshTokenDead)
	}
	endedAT, err := gorm.G[db.AccessToken](gdb).Where("hash = ?", hashToken(ended.AccessToken)).First(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if endedAT.RevokedAt == nil || !endedAT.RevokedAt.Equal(fixedNow) {
		t.Errorf("access token revoked at %v, want %v", endedAT.RevokedAt, fixedNow)
	}

	// The account's other session must be untouched.
	otherRT, err := gorm.G[db.RefreshToken](gdb).Preload("Family", nil).Where("hash = ?", hashToken(other.RefreshToken)).First(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if otherRT.Family.RevokedAt != nil || otherRT.State != db.RefreshTokenIssued {
		t.Errorf("other session was revoked: family revoked at %v, token state %q", otherRT.Family.RevokedAt, otherRT.State)
	}
	otherAT, err := gorm.G[db.AccessToken](gdb).Where("hash = ?", hashToken(other.AccessToken)).First(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if otherAT.RevokedAt != nil {
		t.Errorf("other session's access token revoked at %v", otherAT.RevokedAt)
	}
}

func TestEndSessionTwiceKeepsFirstReason(t *testing.T) {
	svc, acc, gdb := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	tokens := mustStartSession(t, svc, user.ID)

	if err := svc.EndSession(t.Context(), tokens.RefreshToken, "logout"); err != nil {
		t.Fatalf("first EndSession: %v", err)
	}
	err := svc.EndSession(t.Context(), tokens.RefreshToken, "second-reason")
	if !errors.Is(err, ErrEndingSession) {
		t.Fatalf("second EndSession: got %v, want ErrEndingSession", err)
	}

	var family db.RefreshFamily
	if err := gdb.First(&family).Error; err != nil {
		t.Fatal(err)
	}
	if family.RevokeReason == nil || *family.RevokeReason != "logout" {
		t.Errorf("revoke reason = %v, want \"logout\"", family.RevokeReason)
	}
}

func TestEndSessionUnknownToken(t *testing.T) {
	svc, acc, _ := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	mustStartSession(t, svc, user.ID)

	for name, token := range map[string]string{
		"unknown token": "ccr_not-a-real-token",
		"empty token":   "",
	} {
		t.Run(name, func(t *testing.T) {
			if err := svc.EndSession(t.Context(), token, "logout"); !errors.Is(err, ErrInvalidRefreshToken) {
				t.Fatalf("got %v, want ErrInvalidRefreshToken", err)
			}
		})
	}
}
