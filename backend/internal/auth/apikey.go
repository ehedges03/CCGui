package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"sync"

	authv1 "ehedges.net/ccgui/backend/gen/auth/v1"
	"github.com/google/uuid"
)

type Manager struct {
	mu     sync.RWMutex
	hashes map[string]*apiKeyRecord
	keys   map[uuid.UUID]apiKeyRecord
	subs   map[chan string]struct{}
}

var ErrKeyNotFound = errors.New("key not found")
var ErrInvalidKeyID = errors.New("invalid key id")

func NewManager() *Manager {
	return &Manager{
		hashes: make(map[string]*apiKeyRecord),
		keys:   make(map[uuid.UUID]apiKeyRecord),
		subs:   make(map[chan string]struct{}),
	}
}

type apiKeyRecord struct {
	Id   uuid.UUID
	Name string
	Hash string
}

func (m *Manager) Generate(name string) (*authv1.Key, error) {
	id, err := uuid.NewRandom()
	if err != nil {
		return nil, err
	}

	rawKey, err := generateRandomBytes(32)
	if err != nil {
		return nil, err
	}
	key := base64.RawURLEncoding.EncodeToString(rawKey)

	hash := hashAPIKey(key)

	m.mu.Lock()
	m.keys[id] = apiKeyRecord{
		Id:   id,
		Name: name,
		Hash: hash,
	}
	m.hashes[hash] = &apiKeyRecord{
		Id:   id,
		Name: name,
		Hash: hash,
	}
	m.mu.Unlock()

	return &authv1.Key{
		Id:   id.String(),
		Name: name,
		Key:  key,
	}, nil
}

func (m *Manager) Validate(plain string) bool {
	hash := hashAPIKey(plain)
	m.mu.RLock()
	_, ok := m.hashes[hash]
	m.mu.RUnlock()
	return ok
}

func (m *Manager) ResolveID(plain string) (string, bool) {
	hash := hashAPIKey(plain)
	m.mu.RLock()
	record, ok := m.hashes[hash]
	m.mu.RUnlock()
	if !ok {
		return "", false
	}
	return record.Id.String(), true
}

func (m *Manager) GetAll() ([]*authv1.KeySummary, error) {
	m.mu.RLock()
	summaries := make([]*authv1.KeySummary, 0, len(m.keys))
	for _, record := range m.keys {
		summaries = append(summaries, &authv1.KeySummary{
			Id:   record.Id.String(),
			Name: record.Name,
		})
	}
	m.mu.RUnlock()
	return summaries, nil
}

func (m *Manager) Delete(idString string) (*authv1.KeySummary, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, err := uuid.Parse(idString)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidKeyID, err)
	}
	record, ok := m.keys[id]
	if !ok {
		return nil, ErrKeyNotFound
	}
	delete(m.keys, id)
	delete(m.hashes, record.Hash)
	m.notifyDeleteLocked(idString)
	return &authv1.KeySummary{
		Id:   idString,
		Name: record.Name,
	}, nil
}

func (m *Manager) SubscribeDeletes() (<-chan string, func()) {
	ch := make(chan string, 1)
	m.mu.Lock()
	m.subs[ch] = struct{}{}
	m.mu.Unlock()
	return ch, func() {
		m.mu.Lock()
		delete(m.subs, ch)
		close(ch)
		m.mu.Unlock()
	}
}

func (m *Manager) notifyDeleteLocked(id string) {
	for ch := range m.subs {
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
