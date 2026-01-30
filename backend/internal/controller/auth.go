package controller

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	authv1 "ehedges.net/ccgui/backend/gen/auth/v1"
	"ehedges.net/ccgui/backend/internal/auth"
)

type APIKeyManager interface {
	Generate(name string) (*authv1.Key, error)
	Delete(id string) (*authv1.KeySummary, error)
	GetAll() ([]*authv1.KeySummary, error)
}

type AuthController struct {
	manager APIKeyManager
}

func NewAuthController(manager APIKeyManager) *AuthController {
	return &AuthController{
		manager: manager,
	}
}

func (c *AuthController) GenerateKey(ctx context.Context, req *connect.Request[authv1.GenerateKeyRequest]) (*connect.Response[authv1.GenerateKeyResponse], error) {
	name := req.Msg.GetName()
	if name == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("name is required"))
	}

	key, err := c.manager.Generate(name)
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

	summary, err := c.manager.Delete(id)
	if err != nil {
		if errors.Is(err, auth.ErrInvalidKeyID) {
			return nil, connect.NewError(connect.CodeInvalidArgument, err)
		}
		if errors.Is(err, auth.ErrKeyNotFound) {
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
	summaries, err := c.manager.GetAll()
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&authv1.GetAllKeysResponse{
		Keys: summaries,
	}), nil
}
