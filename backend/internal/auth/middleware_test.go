package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"connectrpc.com/connect"
	"ehedges.net/ccgui/backend/gen/auth/v1/authv1connect"
	"ehedges.net/ccgui/backend/internal/db"
)

const protectedPath = "/log.v1.LogService/ShipLogs"

// innerResult records what the wrapped handler saw.
type innerResult struct {
	reached   bool
	principal *Principal
	err       error
}

// authChain wraps a recording handler in both middlewares, in the same order
// as the server (CORS and logging left out).
func authChain(svc *Service) (http.Handler, *innerResult) {
	res := &innerResult{}
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		res.reached = true
		res.principal, res.err = PrincipalFromContext(r.Context())
	})
	return WithResolvedAuth(WithCheckedAuth(inner), svc), res
}

// serve sends a Connect-style unary request. httptest sets RemoteAddr to
// 192.0.2.1:1234 unless remoteAddr is given.
func serve(h http.Handler, path, authHeader, remoteAddr string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, nil)
	req.Header.Set("Content-Type", "application/json")
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	if remoteAddr != "" {
		req.RemoteAddr = remoteAddr
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

// wantConnectError checks the status and the Connect JSON body a client sees.
func wantConnectError(t *testing.T, rec *httptest.ResponseRecorder, status int, code, message string) {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("status = %d, want %d (body %q)", rec.Code, status, rec.Body.String())
	}
	var body struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body %q is not Connect JSON: %v", rec.Body.String(), err)
	}
	if body.Code != code || body.Message != message {
		t.Fatalf("body = %+v, want code %q, message %q", body, code, message)
	}
}

func TestMiddlewareValidToken(t *testing.T) {
	svc, acc, gdb := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	tokens := mustStartSession(t, svc, user.ID)
	h, res := authChain(svc)

	rec := serve(h, protectedPath, "Bearer "+tokens.AccessToken, "")
	if rec.Code != http.StatusOK || !res.reached {
		t.Fatalf("status %d, reached handler %v; want 200 and reached", rec.Code, res.reached)
	}
	if res.err != nil {
		t.Fatalf("PrincipalFromContext: %v", res.err)
	}
	at := storedAccessToken(t, gdb, tokens.AccessToken)
	want := Principal{ID: user.ID, Kind: db.AccountKindUser, RefreshFamilyID: at.FamilyID, AccessTokenID: at.ID}
	if *res.principal != want {
		t.Errorf("principal = %+v, want %+v", *res.principal, want)
	}
}

func TestMiddlewareRejectsProtectedPath(t *testing.T) {
	svc, acc, _ := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	tokens := mustStartSession(t, svc, user.ID)

	cases := map[string]string{
		"no header":          "",
		"wrong scheme":       "Basic Zm9vOmJhcg==",
		"bearer, no token":   "Bearer ",
		"unknown token":      "Bearer cca_not-a-real-token",
		"token without type": tokens.AccessToken,
	}
	for name, header := range cases {
		t.Run(name, func(t *testing.T) {
			h, res := authChain(svc)
			rec := serve(h, protectedPath, header, "")
			wantConnectError(t, rec, http.StatusUnauthorized, "unauthenticated", "unauthenticated")
			if res.reached {
				t.Error("rejected request reached the handler")
			}
			if strings.Contains(rec.Body.String(), "cca_") {
				t.Errorf("response echoes the token: %q", rec.Body.String())
			}
		})
	}
}

func TestMiddlewareIPBindingUsesRemoteAddr(t *testing.T) {
	svc, acc, _ := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	// httptest's default RemoteAddr is 192.0.2.1:1234; the port must be ignored.
	tokens := mustStartBoundSession(t, svc, user.ID, "192.0.2.1")

	h, res := authChain(svc)
	if rec := serve(h, protectedPath, "Bearer "+tokens.AccessToken, "192.0.2.1:5555"); rec.Code != http.StatusOK || !res.reached {
		t.Fatalf("same IP, different port: status %d, reached %v; want 200 and reached", rec.Code, res.reached)
	}

	h, res = authChain(svc)
	rec := serve(h, protectedPath, "Bearer "+tokens.AccessToken, "198.51.100.9:1234")
	wantConnectError(t, rec, http.StatusUnauthorized, "unauthenticated", "unauthenticated")
	if res.reached {
		t.Error("request from another IP reached the handler")
	}
}

func TestMiddlewarePublicPaths(t *testing.T) {
	svc, acc, _ := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	tokens := mustStartSession(t, svc, user.ID)

	for _, path := range []string{authv1connect.AuthServiceLoginProcedure, authv1connect.AuthServiceLogoutProcedure} {
		t.Run(path+" without token", func(t *testing.T) {
			h, res := authChain(svc)
			rec := serve(h, path, "", "")
			if rec.Code != http.StatusOK || !res.reached {
				t.Fatalf("status %d, reached %v; want 200 and reached", rec.Code, res.reached)
			}
			if res.principal != nil || !errors.Is(res.err, ErrUnauthenticated) {
				t.Errorf("got %v, %v; want no principal and ErrUnauthenticated", res.principal, res.err)
			}
		})
		t.Run(path+" with bad token", func(t *testing.T) {
			h, res := authChain(svc)
			if rec := serve(h, path, "Bearer cca_not-a-real-token", ""); rec.Code != http.StatusOK || !res.reached {
				t.Fatalf("status %d, reached %v; want 200 and reached", rec.Code, res.reached)
			}
		})
		t.Run(path+" with valid token", func(t *testing.T) {
			h, res := authChain(svc)
			serve(h, path, "Bearer "+tokens.AccessToken, "")
			if res.err != nil || res.principal == nil || res.principal.ID != user.ID {
				t.Errorf("got %v, %v; want the caller's principal", res.principal, res.err)
			}
		})
	}
}

// A database failure must not look like a bad token, or every client would
// throw its credentials away during an outage.
func TestMiddlewareDatabaseErrorIsInternal(t *testing.T) {
	svc, acc, gdb := newSessionService(t)
	user := mustCreateUser(t, acc, "foo-user")
	tokens := mustStartSession(t, svc, user.ID)
	sqlDB, err := gdb.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.Close()

	h, res := authChain(svc)
	rec := serve(h, protectedPath, "Bearer "+tokens.AccessToken, "")
	wantConnectError(t, rec, http.StatusInternalServerError, "internal", "internal error")
	if res.reached {
		t.Error("request reached the handler after an auth failure")
	}
}

func TestPrincipalFromContext(t *testing.T) {
	t.Run("no middleware", func(t *testing.T) {
		p, err := PrincipalFromContext(t.Context())
		if p != nil || connect.CodeOf(err) != connect.CodeUnauthenticated || !errors.Is(err, ErrUnauthenticated) {
			t.Fatalf("got %v, %v; want nil and an Unauthenticated error", p, err)
		}
	})
	t.Run("internal failure", func(t *testing.T) {
		ctx := context.WithValue(t.Context(), principalContextKey, &wrappedPrincipal{err: ErrPrincipalRetrieval})
		p, err := PrincipalFromContext(ctx)
		if p != nil || connect.CodeOf(err) != connect.CodeInternal || !errors.Is(err, ErrPrincipalRetrieval) {
			t.Fatalf("got %v, %v; want nil and an Internal error matching ErrPrincipalRetrieval", p, err)
		}
	})
	t.Run("success returns a nil error interface", func(t *testing.T) {
		want := &Principal{ID: "foo-account"}
		ctx := context.WithValue(t.Context(), principalContextKey, &wrappedPrincipal{principal: want})
		// Passing the result through a plain error variable must still give nil
		// (guards against returning a typed nil *connect.Error).
		var err error
		var p *Principal
		p, err = PrincipalFromContext(ctx)
		if err != nil || p != want {
			t.Fatalf("got %v, %v (%T); want %v and nil", p, err, err, want)
		}
	})
}
