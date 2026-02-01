package repository

import (
	"context"
	"errors"
	"time"
)

var ErrNotFound = errors.New("record not found")

type APIKeyRecord struct {
	ID        string
	Name      string
	Hash      string
	CreatedAt time.Time
}

type APIKeyCreate struct {
	Name string
	Hash string
}

type APIKeyRepository interface {
	Create(ctx context.Context, record APIKeyCreate) (*APIKeyRecord, error)
	DeleteByID(ctx context.Context, id string) (*APIKeyRecord, error)
	GetByHash(ctx context.Context, hash string) (*APIKeyRecord, error)
	List(ctx context.Context) ([]*APIKeyRecord, error)
}
