package auth

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"slices"
	"strings"

	"connectrpc.com/connect"
	"ehedges.net/ccgui/backend/gen/auth/v1/authv1connect"
	"ehedges.net/ccgui/backend/internal/db"
)

var (
	ErrPrincipalRetrieval = errors.New("failed to retrieve principal")
)

type Principal struct {
	ID              string
	Kind            db.AccountKind
	RefreshFamilyID string
	AccessTokenID   string
}

type wrappedPrincipal struct {
	principal *Principal
	err       error
}

type contextKey struct{}

var principalContextKey = contextKey{}

// PrincipalFromContext returns the caller resolved by WithResolvedAuth. Errors
// are *connect.Error values (Unauthenticated or Internal) that still match
// ErrUnauthenticated and ErrPrincipalRetrieval with errors.Is.
func PrincipalFromContext(ctx context.Context) (*Principal, error) {
	wPrincipal, ok := ctx.Value(principalContextKey).(*wrappedPrincipal)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, ErrUnauthenticated)
	}
	if wPrincipal.err != nil {
		if errors.Is(wPrincipal.err, ErrUnauthenticated) {
			return nil, connect.NewError(connect.CodeUnauthenticated, wPrincipal.err)
		}
		return nil, connect.NewError(connect.CodeInternal, wPrincipal.err)
	}
	return wPrincipal.principal, nil
}

func authFailed(next http.Handler, w http.ResponseWriter, r *http.Request, err error) {
	ctx := context.WithValue(r.Context(), principalContextKey, &wrappedPrincipal{
		principal: nil,
		err:       err,
	})
	next.ServeHTTP(w, r.WithContext(ctx))
}

var publicPaths = []string{
	authv1connect.AuthServiceLoginProcedure,
	authv1connect.AuthServiceLogoutProcedure,
}

func isPublicPath(r *http.Request) bool {
	return slices.Contains(publicPaths, r.URL.Path)
}

func WithResolvedAuth(next http.Handler, service *Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		skipWarnings := isPublicPath(r) || r.Method == http.MethodOptions
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			if !skipWarnings {
				slog.WarnContext(r.Context(), "request with invalid auth header")
			}
			authFailed(next, w, r, ErrUnauthenticated)
			return
		}

		// TODO: support reverse proxy with trusted remote addr and then use header
		ip, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			slog.ErrorContext(r.Context(), "failed to get ip from user", "err", err)
			authFailed(next, w, r, ErrUnauthenticated)
			return
		}
		token := strings.TrimPrefix(authHeader, "Bearer ")
		accessToken, err := service.Authenticate(r.Context(), token, &ip)
		if errors.Is(err, ErrUnauthenticated) {
			if !skipWarnings {
				slog.WarnContext(r.Context(), "unauthenticated request", "err", err)
			}
			authFailed(next, w, r, ErrUnauthenticated)
			return
		}
		if err != nil {
			slog.ErrorContext(r.Context(), "internal authentication failure", "err", err)
			authFailed(next, w, r, ErrPrincipalRetrieval)
			return
		}

		if accessToken == nil || accessToken.Account == nil {
			slog.ErrorContext(r.Context(), "authentication failure failed to load token/account")
			authFailed(next, w, r, ErrPrincipalRetrieval)
			return
		}

		ctx := context.WithValue(r.Context(), principalContextKey, &wrappedPrincipal{
			principal: &Principal{
				ID:              accessToken.Account.ID,
				Kind:            accessToken.Account.Kind,
				RefreshFamilyID: accessToken.FamilyID,
				AccessTokenID:   accessToken.ID,
			},
			err: nil,
		})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func WithCheckedAuth(next http.Handler) http.Handler {
	errWriter := connect.NewErrorWriter() // once per middleware, shared by all requests

	writeErr := func(w http.ResponseWriter, r *http.Request, code connect.Code, msg string) {
		if err := errWriter.Write(w, r, connect.NewError(code, errors.New(msg))); err != nil {
			slog.ErrorContext(r.Context(), "write auth error", "err", err)
		}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isPublicPath(r) {
			next.ServeHTTP(w, r)
			return
		}
		_, err := PrincipalFromContext(r.Context())
		if err != nil {
			if errors.Is(err, ErrUnauthenticated) {
				writeErr(w, r, connect.CodeUnauthenticated, "unauthenticated")
			} else {
				writeErr(w, r, connect.CodeInternal, "internal error")
			}
			return
		}

		next.ServeHTTP(w, r)
	})
}
