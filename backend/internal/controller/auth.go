package controller

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	authv1 "ehedges.net/ccgui/backend/gen/auth/v1"
	"ehedges.net/ccgui/backend/internal/service"
)

type AuthController struct {
	service service.APIKeyService
}

func NewAuthController(service service.APIKeyService) *AuthController {
	return &AuthController{
		service: service,
	}
}

func (c *AuthController) GenerateKey(ctx context.Context, req *connect.Request[authv1.GenerateKeyRequest]) (*connect.Response[authv1.GenerateKeyResponse], error) {
	name := req.Msg.GetName()
	if name == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("name is required"))
	}

	key, err := c.service.Generate(ctx, name)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&authv1.GenerateKeyResponse{
		Key: &authv1.Key{
			Id:   key.Id,
			Name: key.Name,
			Key:  key.Key,
		},
	}), nil
}

func (c *AuthController) DeleteKey(ctx context.Context, req *connect.Request[authv1.DeleteKeyRequest]) (*connect.Response[authv1.DeleteKeyResponse], error) {
	id := req.Msg.GetId()
	if id == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("id is required"))
	}

	summary, err := c.service.Delete(ctx, id)
	if err != nil {
		if errors.Is(err, service.ErrInvalidKeyID) {
			return nil, connect.NewError(connect.CodeInvalidArgument, err)
		}
		if errors.Is(err, service.ErrKeyNotFound) {
			return nil, connect.NewError(connect.CodeNotFound, err)
		}
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&authv1.DeleteKeyResponse{
		Summary: &authv1.KeySummary{
			Id:   summary.Id,
			Name: summary.Name,
		},
	}), nil
}

func (c *AuthController) GetAllKeys(ctx context.Context, req *connect.Request[authv1.GetAllKeysRequest]) (*connect.Response[authv1.GetAllKeysResponse], error) {
	summaries, err := c.service.GetAll(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&authv1.GetAllKeysResponse{
		Keys: summaries,
	}), nil
}
