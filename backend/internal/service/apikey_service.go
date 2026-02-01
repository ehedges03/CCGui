package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"sync"

	authv1 "ehedges.net/ccgui/backend/gen/auth/v1"
	"ehedges.net/ccgui/backend/internal/repository"
	"github.com/google/uuid"
)

const keyLength = 64

var ErrKeyNotFound = errors.New("key not found")
var ErrInvalidKeyID = errors.New("invalid key id")

type APIKeyService interface {
	Generate(ctx context.Context, name string) (*authv1.Key, error)
	Delete(ctx context.Context, id string) (*authv1.KeySummary, error)
	GetAll(ctx context.Context) ([]*authv1.KeySummary, error)
	Validate(plain string) bool
	ResolveID(plain string) (string, bool)
	SubscribeDeletes() (<-chan string, func())
}

type APIKeyServiceImpl struct {
	repo repository.APIKeyRepository
	mu   sync.RWMutex
	subs map[chan string]struct{}
}

func NewAPIKeyService(repo repository.APIKeyRepository) *APIKeyServiceImpl {
	return &APIKeyServiceImpl{
		repo: repo,
		subs: make(map[chan string]struct{}),
	}
}

func (s *APIKeyServiceImpl) Generate(ctx context.Context, name string) (*authv1.Key, error) {
	rawKey, err := generateRandomBytes(keyLength)
	if err != nil {
		return nil, err
	}
	key := base64.RawURLEncoding.EncodeToString(rawKey)
	hash := hashAPIKey(key)

	record, err := s.repo.Create(ctx, repository.APIKeyCreate{
		Name: name,
		Hash: hash,
	})
	if err != nil {
		return nil, err
	}

	return &authv1.Key{
		Id:   record.ID,
		Name: record.Name,
		Key:  key,
	}, nil
}

func (s *APIKeyServiceImpl) Delete(ctx context.Context, id string) (*authv1.KeySummary, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidKeyID, err)
	}
	record, err := s.repo.DeleteByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrKeyNotFound
		}
		return nil, err
	}
	s.notifyDelete(id)
	return &authv1.KeySummary{
		Id:   record.ID,
		Name: record.Name,
	}, nil
}

func (s *APIKeyServiceImpl) GetAll(ctx context.Context) ([]*authv1.KeySummary, error) {
	records, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}
	summaries := make([]*authv1.KeySummary, 0, len(records))
	for _, record := range records {
		summaries = append(summaries, &authv1.KeySummary{
			Id:   record.ID,
			Name: record.Name,
		})
	}
	return summaries, nil
}

func (s *APIKeyServiceImpl) Validate(plain string) bool {
	_, ok := s.ResolveID(plain)
	return ok
}

func (s *APIKeyServiceImpl) ResolveID(plain string) (string, bool) {
	hash := hashAPIKey(plain)
	record, err := s.repo.GetByHash(context.Background(), hash)
	if err != nil {
		return "", false
	}
	return record.ID, true
}

func (s *APIKeyServiceImpl) SubscribeDeletes() (<-chan string, func()) {
	ch := make(chan string, 1)
	s.mu.Lock()
	s.subs[ch] = struct{}{}
	s.mu.Unlock()
	return ch, func() {
		s.mu.Lock()
		delete(s.subs, ch)
		close(ch)
		s.mu.Unlock()
	}
}

func (s *APIKeyServiceImpl) notifyDelete(id string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for ch := range s.subs {
		select {
		case ch <- id:
		default:
		}
	}
}

func hashAPIKey(plain string) string {
	hashBytes := sha256.Sum256([]byte(plain))
	return base64.RawURLEncoding.EncodeToString(hashBytes[:])
}

func generateRandomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	if err != nil {
		return nil, err
	}
	return b, nil
}
