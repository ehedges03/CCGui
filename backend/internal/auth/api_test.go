package auth

import (
	"errors"
	"testing"

	"connectrpc.com/connect"
	authv1 "ehedges.net/ccgui/backend/gen/auth/v1"
	"ehedges.net/ccgui/backend/internal/db"
)

func login(t *testing.T, h *APIHandler, username, password string) (*connect.Response[authv1.IssuedTokensResponse], error) {
	t.Helper()
	return h.Login(t.Context(), connect.NewRequest(&authv1.LoginRequest{Username: username, Password: password}))
}

func logout(t *testing.T, h *APIHandler, refreshToken string) error {
	t.Helper()
	_, err := h.Logout(t.Context(), connect.NewRequest(&authv1.LogoutRequest{RefreshToken: refreshToken}))
	return err
}

// wantCode checks the connect code and the exact message the client would see.
func wantCode(t *testing.T, err error, code connect.Code, message string) {
	t.Helper()
	if connect.CodeOf(err) != code {
		t.Fatalf("got %v (code %v), want code %v", err, connect.CodeOf(err), code)
	}
	var connectErr *connect.Error
	if !errors.As(err, &connectErr) || connectErr.Message() != message {
		t.Fatalf("client sees message %q, want %q", connectErr.Message(), message)
	}
}

func TestLoginReturnsTokens(t *testing.T) {
	svc, _, gdb := newSessionService(t)
	user := mustCreateUserWithPassword(t, svc, "foo-user", "foouser", "secret-pass")
	h := NewAPIHandler(svc)

	resp, err := login(t, h, "FooUser", "secret-pass")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	msg := resp.Msg
	if msg.RefreshToken == "" || msg.AccessToken == "" {
		t.Fatalf("missing tokens in %v", msg)
	}
	if got, want := msg.AccessTokenExpiry.AsTime(), fixedNow.Add(accessTokenTTL); !got.Equal(want) {
		t.Errorf("expiry = %v, want %v", got, want)
	}

	var family db.RefreshFamily
	if err := gdb.First(&family).Error; err != nil {
		t.Fatal(err)
	}
	if family.AccountID != user.ID || family.BoundIP != nil {
		t.Errorf("family = %+v, want account %s with no bound IP", family, user.ID)
	}
}

// A wrong password and an unknown username must look identical to the client,
// or the response reveals which usernames exist.
func TestLoginBadCredentialsLookTheSame(t *testing.T) {
	svc, _, _ := newSessionService(t)
	mustCreateUserWithPassword(t, svc, "foo-user", "foouser", "secret-pass")
	h := NewAPIHandler(svc)

	for name, c := range map[string]struct{ username, password string }{
		"wrong password":   {"foouser", "wrong-pass"},
		"unknown username": {"baruser", "secret-pass"},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := login(t, h, c.username, c.password)
			wantCode(t, err, connect.CodeUnauthenticated, ErrInvalidLogin.Error())
		})
	}
}

func TestLoginDisabledAccount(t *testing.T) {
	svc, acc, _ := newSessionService(t)
	user := mustCreateUserWithPassword(t, svc, "foo-user", "foouser", "secret-pass")
	if err := acc.DisableAccount(t.Context(), user.ID); err != nil {
		t.Fatal(err)
	}

	_, err := login(t, NewAPIHandler(svc), "foouser", "secret-pass")
	wantCode(t, err, connect.CodePermissionDenied, ErrAccountDisabled.Error())
}

// Server-side failures must not leak their details to the client.
func TestLoginServerErrorIsGeneric(t *testing.T) {
	svc, acc, gdb := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	if err := gdb.Create(&db.Password{AccountID: user.ID, Username: "foouser", PasswordHash: "not-a-hash"}).Error; err != nil {
		t.Fatal(err)
	}

	_, err := login(t, NewAPIHandler(svc), "foouser", "secret-pass")
	wantCode(t, err, connect.CodeInternal, "internal error")
}

func TestLogout(t *testing.T) {
	svc, _, _ := newSessionService(t)
	mustCreateUserWithPassword(t, svc, "foo-user", "foouser", "secret-pass")
	h := NewAPIHandler(svc)
	resp, err := login(t, h, "foouser", "secret-pass")
	if err != nil {
		t.Fatal(err)
	}

	if err := logout(t, h, resp.Msg.RefreshToken); err != nil {
		t.Fatalf("Logout: %v", err)
	}
	wantCode(t, logout(t, h, resp.Msg.RefreshToken), connect.CodeUnauthenticated, ErrInvalidRefreshToken.Error())
	wantCode(t, logout(t, h, "ccr_not-a-real-token"), connect.CodeUnauthenticated, ErrInvalidRefreshToken.Error())
}
