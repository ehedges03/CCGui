package auth

import (
	"context"
	"errors"
	"log/slog"

	"connectrpc.com/connect"
	authv1 "ehedges.net/ccgui/backend/gen/auth/v1"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

var (
	ErrInvalidLogin = errors.New("invalid login")
)

type APIHandler struct {
	service *Service
}

func NewAPIHandler(service *Service) *APIHandler {
	return &APIHandler{
		service: service,
	}
}

// internalError logs err and returns a generic CodeInternal error. Connect sends
// an error's message to the client, so server details must not reach it.
func internalError(ctx context.Context, msg string, err error) *connect.Error {
	slog.ErrorContext(ctx, msg, "err", err)
	return connect.NewError(connect.CodeInternal, errors.New("internal error"))
}

func (a *APIHandler) Login(ctx context.Context, req *connect.Request[authv1.LoginRequest]) (*connect.Response[authv1.IssuedTokensResponse], error) {
	accountID, err := a.service.TryLogin(ctx, req.Msg.Username, req.Msg.Password)
	switch {
	case errors.Is(err, ErrIncorrectUsername), errors.Is(err, ErrIncorrectPassword):
		slog.WarnContext(ctx, "failed login", "username", req.Msg.Username, "err", err)
		return nil, connect.NewError(connect.CodeUnauthenticated, ErrInvalidLogin)
	case err != nil:
		return nil, internalError(ctx, "login", err)
	}

	issuedTokens, err := a.service.StartSession(ctx, accountID, nil)
	switch {
	case errors.Is(err, ErrAccountDisabled):
		return nil, connect.NewError(connect.CodePermissionDenied, ErrAccountDisabled)
	case err != nil:
		return nil, internalError(ctx, "start session", err)
	}

	return connect.NewResponse(&authv1.IssuedTokensResponse{
		RefreshToken:      issuedTokens.RefreshToken,
		AccessToken:       issuedTokens.AccessToken,
		AccessTokenExpiry: timestamppb.New(issuedTokens.AccessTokenExpiry),
	}), nil

}

func (a *APIHandler) Logout(ctx context.Context, req *connect.Request[authv1.LogoutRequest]) (*connect.Response[emptypb.Empty], error) {
	err := a.service.EndSession(ctx, req.Msg.RefreshToken, "logout")
	switch {
	case errors.Is(err, ErrInvalidRefreshToken), errors.Is(err, ErrEndingSession):
		return nil, connect.NewError(connect.CodeUnauthenticated, ErrInvalidRefreshToken)
	case err != nil:
		return nil, internalError(ctx, "end session", err)
	}

	return connect.NewResponse(&emptypb.Empty{}), nil
}
