package auth

import (
	"errors"
	"testing"
	"time"

	"ehedges.net/ccgui/backend/internal/db"
	"gorm.io/gorm"
)

func storedAccessToken(t *testing.T, gdb *gorm.DB, plaintext string) db.AccessToken {
	t.Helper()
	at, err := gorm.G[db.AccessToken](gdb).Where("hash = ?", hashToken(plaintext)).First(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	return at
}

func mustStartBoundSession(t *testing.T, svc *Service, accountID, ip string) *IssuedTokens {
	t.Helper()
	tokens, err := svc.StartSession(t.Context(), accountID, &ip)
	if err != nil {
		t.Fatal(err)
	}
	return tokens
}

func TestAuthenticateValidToken(t *testing.T) {
	svc, acc, gdb := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	tokens := mustStartSession(t, svc, user.ID)

	at, err := svc.Authenticate(t.Context(), tokens.AccessToken, nil)
	if err != nil {
		t.Fatalf("Authenticate: %v", err)
	}
	if at.Account == nil || at.Account.ID != user.ID {
		t.Errorf("account = %+v, want %s loaded", at.Account, user.ID)
	}
	if at.Family == nil || at.Family.ID != at.FamilyID {
		t.Errorf("family = %+v, want %s loaded", at.Family, at.FamilyID)
	}

	stored := storedAccessToken(t, gdb, tokens.AccessToken)
	if stored.FirstUsedAt == nil || !stored.FirstUsedAt.Equal(fixedNow) {
		t.Errorf("stored FirstUsedAt = %v, want %v", stored.FirstUsedAt, fixedNow)
	}
}

func TestAuthenticateKeepsFirstUse(t *testing.T) {
	svc, acc, gdb := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	tokens := mustStartSession(t, svc, user.ID)

	if _, err := svc.Authenticate(t.Context(), tokens.AccessToken, nil); err != nil {
		t.Fatal(err)
	}
	later := fixedNow.Add(time.Minute)
	svc.now = func() time.Time { return later }
	if _, err := svc.Authenticate(t.Context(), tokens.AccessToken, nil); err != nil {
		t.Fatalf("second Authenticate: %v", err)
	}

	stored := storedAccessToken(t, gdb, tokens.AccessToken)
	if stored.FirstUsedAt == nil || !stored.FirstUsedAt.Equal(fixedNow) {
		t.Errorf("FirstUsedAt = %v after a later use, want it kept at %v", stored.FirstUsedAt, fixedNow)
	}
}

func TestAuthenticateExpiry(t *testing.T) {
	svc, acc, gdb := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	// Both issued at fixedNow. The second is never used before expiry, so its
	// FirstUsedAt can show the rejected use was not recorded.
	tokens := mustStartSession(t, svc, user.ID)
	expired := mustStartSession(t, svc, user.ID)
	expiry := fixedNow.Add(accessTokenTTL)

	svc.now = func() time.Time { return expiry.Add(-time.Nanosecond) }
	if _, err := svc.Authenticate(t.Context(), tokens.AccessToken, nil); err != nil {
		t.Fatalf("just before expiry: %v", err)
	}

	svc.now = func() time.Time { return expiry }
	if _, err := svc.Authenticate(t.Context(), expired.AccessToken, nil); !errors.Is(err, ErrAccessTokenExpired) {
		t.Fatalf("at expiry: got %v, want ErrAccessTokenExpired", err)
	}
	if stored := storedAccessToken(t, gdb, expired.AccessToken); stored.FirstUsedAt != nil {
		t.Errorf("rejected token got FirstUsedAt = %v", stored.FirstUsedAt)
	}
}

func TestAuthenticateRejects(t *testing.T) {
	cases := map[string]struct {
		// setup returns the token to present and the IP to present it from.
		setup func(t *testing.T, svc *Service, gdb *gorm.DB, user *db.Account) (string, *string)
		want  error
	}{
		"unknown token": {
			setup: func(t *testing.T, svc *Service, gdb *gorm.DB, user *db.Account) (string, *string) {
				return "cca_not-a-real-token", nil
			},
			want: ErrInvalidAccessToken,
		},
		"empty token": {
			setup: func(t *testing.T, svc *Service, gdb *gorm.DB, user *db.Account) (string, *string) {
				return "", nil
			},
			want: ErrInvalidAccessToken,
		},
		"refresh token presented as access token": {
			setup: func(t *testing.T, svc *Service, gdb *gorm.DB, user *db.Account) (string, *string) {
				return mustStartSession(t, svc, user.ID).RefreshToken, nil
			},
			want: ErrInvalidAccessToken,
		},
		"session logged out": {
			setup: func(t *testing.T, svc *Service, gdb *gorm.DB, user *db.Account) (string, *string) {
				tokens := mustStartSession(t, svc, user.ID)
				if err := svc.EndSession(t.Context(), tokens.RefreshToken, "logout"); err != nil {
					t.Fatal(err)
				}
				return tokens.AccessToken, nil
			},
			want: ErrSessionRevoked,
		},
		"access token revoked, family still live": {
			setup: func(t *testing.T, svc *Service, gdb *gorm.DB, user *db.Account) (string, *string) {
				tokens := mustStartSession(t, svc, user.ID)
				if _, err := gorm.G[db.AccessToken](gdb).Where("hash = ?", hashToken(tokens.AccessToken)).Update(t.Context(), "revoked_at", fixedNow); err != nil {
					t.Fatal(err)
				}
				return tokens.AccessToken, nil
			},
			want: ErrSessionRevoked,
		},
		"family revoked, access token not marked": {
			setup: func(t *testing.T, svc *Service, gdb *gorm.DB, user *db.Account) (string, *string) {
				tokens := mustStartSession(t, svc, user.ID)
				at := storedAccessToken(t, gdb, tokens.AccessToken)
				if _, err := gorm.G[db.RefreshFamily](gdb).Where("id = ?", at.FamilyID).Update(t.Context(), "revoked_at", fixedNow); err != nil {
					t.Fatal(err)
				}
				return tokens.AccessToken, nil
			},
			want: ErrSessionRevoked,
		},
		"bound session, different IP": {
			setup: func(t *testing.T, svc *Service, gdb *gorm.DB, user *db.Account) (string, *string) {
				other := "198.51.100.9"
				return mustStartBoundSession(t, svc, user.ID, "203.0.113.7").AccessToken, &other
			},
			want: ErrInvalidSessionIP,
		},
		"bound session, no IP": {
			setup: func(t *testing.T, svc *Service, gdb *gorm.DB, user *db.Account) (string, *string) {
				return mustStartBoundSession(t, svc, user.ID, "203.0.113.7").AccessToken, nil
			},
			want: ErrInvalidSessionIP,
		},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			svc, acc, gdb := newSessionService(t)
			user := mustCreateUser(t, acc, "foo-user")
			token, ip := c.setup(t, svc, gdb, user)

			at, err := svc.Authenticate(t.Context(), token, ip)
			if !errors.Is(err, c.want) || at != nil {
				t.Fatalf("got %v, %v; want nil, %v", at, err, c.want)
			}
			if !errors.Is(err, ErrUnauthenticated) {
				t.Errorf("%v does not match ErrUnauthenticated, so the middleware would answer 500", err)
			}
		})
	}
}

func TestAuthenticateDisabledAccount(t *testing.T) {
	svc, acc, _ := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	tokens := mustStartSession(t, svc, user.ID)
	if err := acc.DisableAccount(t.Context(), user.ID); err != nil {
		t.Fatal(err)
	}

	_, err := svc.Authenticate(t.Context(), tokens.AccessToken, nil)
	if !errors.Is(err, ErrAccountDisabled) || !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("got %v, want ErrAccountDisabled under ErrUnauthenticated", err)
	}
}

func TestAuthenticateIPBinding(t *testing.T) {
	svc, acc, _ := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	boundIP := "203.0.113.7"
	bound := mustStartBoundSession(t, svc, user.ID, boundIP)
	unbound := mustStartSession(t, svc, user.ID)

	// A separate string with the same text: the check must compare values, not pointers.
	sameIP := string([]byte(boundIP))
	if _, err := svc.Authenticate(t.Context(), bound.AccessToken, &sameIP); err != nil {
		t.Errorf("bound session from its own IP: %v", err)
	}
	anyIP := "198.51.100.9"
	if _, err := svc.Authenticate(t.Context(), unbound.AccessToken, &anyIP); err != nil {
		t.Errorf("unbound session from any IP: %v", err)
	}
	if _, err := svc.Authenticate(t.Context(), unbound.AccessToken, nil); err != nil {
		t.Errorf("unbound session with no IP: %v", err)
	}
}

func TestAuthenticateDatabaseErrorIsNotUnauthenticated(t *testing.T) {
	svc, acc, gdb := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	tokens := mustStartSession(t, svc, user.ID)
	sqlDB, err := gdb.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.Close()

	_, err = svc.Authenticate(t.Context(), tokens.AccessToken, nil)
	if err == nil || errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("got %v, want a server error that is not ErrUnauthenticated", err)
	}
}
