package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"ehedges.net/ccgui/backend/internal/accounts"
	"ehedges.net/ccgui/backend/internal/db"
	"gorm.io/gorm"
)

var (
	ErrUsernameTaken          = errors.New("username already taken")
	ErrUserAlreadyHasPassword = errors.New("account already has a password")
	ErrInvalidUsername        = errors.New("invalid username")
	ErrInvalidPassword        = errors.New("invalid password")
)

// Service owns credentials. Create it with New.
type Service struct {
	db       *gorm.DB
	accounts *accounts.Service
}

func New(db *gorm.DB, accountsService *accounts.Service) *Service {
	return &Service{
		db:       db,
		accounts: accountsService,
	}
}

// WithTx returns a copy of the service that runs on tx.
func (a *Service) WithTx(tx *gorm.DB) *Service {
	c := *a
	c.db = tx
	return &c
}

func validateUsername(username string) error {
	if len(username) < 1 {
		return fmt.Errorf("length of the username (%d) is less than min %d: %w", len(username), 1, ErrInvalidUsername)
	}

	return nil
}

func validatePassword(password string) error {
	if len(password) < 8 {
		return fmt.Errorf("length of the password (%d) is less than min %d: %w", len(password), 8, ErrInvalidPassword)
	}

	return nil
}

func newPassword(username, password string) (*string, error) {
	username = strings.ToLower(username)
	if err := validateUsername(username); err != nil {
		return nil, err
	}
	if err := validatePassword(password); err != nil {
		return nil, err
	}

	hashedPassword, err := hashPassword(password)

	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	return &hashedPassword, nil
}

func insertPassword(ctx context.Context, conn *gorm.DB, p *db.Password) (*db.Password, error) {
	p.Username = strings.ToLower(p.Username)
	err := gorm.G[db.Password](conn).Create(ctx, p)
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		// The account_id primary key and the username unique index both surface as
		// ErrDuplicatedKey, so check which one was hit.
		n, countErr := gorm.G[db.Password](conn).Where("account_id = ?", p.AccountID).Count(ctx, "*")
		if countErr != nil {
			return nil, fmt.Errorf("check existing password: %w", countErr)
		}
		if n > 0 {
			return nil, ErrUserAlreadyHasPassword
		}
		return nil, ErrUsernameTaken
	}
	if err != nil {
		return nil, fmt.Errorf("insert password: %w", err)
	}

	return p, nil
}

func (a *Service) CreatePassword(ctx context.Context, accountID, username, password string) (*db.Password, error) {
	hashedPassword, err := newPassword(username, password)
	if err != nil {
		return nil, err
	}

	return insertPassword(ctx, a.db, &db.Password{
		AccountID:    accountID,
		Username:     username,
		PasswordHash: *hashedPassword,
	})
}

func (a *Service) CreateUserWithPassword(ctx context.Context, name, username, password string) (*db.Account, error) {
	var userAccount *db.Account
	hashedPassword, err := newPassword(username, password)
	if err != nil {
		return nil, err
	}
	err = a.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		userAccount, err = a.accounts.WithTx(tx).CreateUser(ctx, name)
		if err != nil {
			return err
		}

		_, err = insertPassword(ctx, tx, &db.Password{
			AccountID:    userAccount.ID,
			Username:     username,
			PasswordHash: *hashedPassword,
		})
		if err != nil {
			return err
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return userAccount, nil
}
