package controller

import (
	"context"
	"errors"
	"strings"

	"connectrpc.com/connect"
	"ehedges.net/ccgui/backend/internal/service"
)

type keyIDContextKey struct{}

// NewAPIKeyInterceptor rejects requests without a valid "Authorization: Bearer <key>"
// header and stores the resolved key id in the request context.
func NewAPIKeyInterceptor(keys service.APIKeyService) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			plain, ok := strings.CutPrefix(req.Header().Get("Authorization"), "Bearer ")
			if !ok {
				return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("missing bearer token"))
			}
			id, ok := keys.ResolveID(plain)
			if !ok {
				return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid api key"))
			}
			return next(context.WithValue(ctx, keyIDContextKey{}, id), req)
		}
	}
}

// KeyIDFromContext returns the API key id set by NewAPIKeyInterceptor.
func KeyIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(keyIDContextKey{}).(string)
	return id
}
