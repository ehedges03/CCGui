package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type gormAPIKey struct {
	ID        string    `gorm:"primaryKey;type:text"`
	Name      string    `gorm:"not null"`
	Hash      string    `gorm:"uniqueIndex;not null"`
	CreatedAt time.Time `gorm:"not null"`
}

func (k *gormAPIKey) BeforeCreate(tx *gorm.DB) error {
	if k.ID == "" {
		k.ID = uuid.NewString()
	}
	return nil
}

type GormAPIKeyRepository struct {
	db *gorm.DB
}

func NewGormAPIKeyRepository(db *gorm.DB) *GormAPIKeyRepository {
	return &GormAPIKeyRepository{db: db}
}

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(&gormAPIKey{})
}

func (r *GormAPIKeyRepository) Create(ctx context.Context, record APIKeyCreate) (*APIKeyRecord, error) {
	model := gormAPIKey{
		Name: record.Name,
		Hash: record.Hash,
	}
	if err := r.db.WithContext(ctx).Create(&model).Error; err != nil {
		return nil, err
	}
	return &APIKeyRecord{
		ID:        model.ID,
		Name:      model.Name,
		Hash:      model.Hash,
		CreatedAt: model.CreatedAt,
	}, nil
}

func (r *GormAPIKeyRepository) DeleteByID(ctx context.Context, id string) (*APIKeyRecord, error) {
	var model gormAPIKey
	if err := r.db.WithContext(ctx).First(&model, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if err := r.db.WithContext(ctx).Delete(&gormAPIKey{}, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &APIKeyRecord{
		ID:        model.ID,
		Name:      model.Name,
		Hash:      model.Hash,
		CreatedAt: model.CreatedAt,
	}, nil
}

func (r *GormAPIKeyRepository) GetByHash(ctx context.Context, hash string) (*APIKeyRecord, error) {
	var model gormAPIKey
	if err := r.db.WithContext(ctx).First(&model, "hash = ?", hash).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &APIKeyRecord{
		ID:        model.ID,
		Name:      model.Name,
		Hash:      model.Hash,
		CreatedAt: model.CreatedAt,
	}, nil
}

func (r *GormAPIKeyRepository) List(ctx context.Context) ([]*APIKeyRecord, error) {
	var models []gormAPIKey
	if err := r.db.WithContext(ctx).Order("created_at desc").Find(&models).Error; err != nil {
		return nil, err
	}
	records := make([]*APIKeyRecord, 0, len(models))
	for _, model := range models {
		records = append(records, &APIKeyRecord{
			ID:        model.ID,
			Name:      model.Name,
			Hash:      model.Hash,
			CreatedAt: model.CreatedAt,
		})
	}
	return records, nil
}
