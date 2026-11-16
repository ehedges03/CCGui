package accounts

import (
	"context"
	"errors"
	"fmt"
	"time"

	"ehedges.net/ccgui/backend/internal/db"
	"gorm.io/gorm"
)

var (
	ErrNilAccount    = errors.New("account is nil")
	ErrNotFound      = errors.New("account not found")
	ErrInvalidParent = errors.New("parent must be a user account")
	ErrInvalidName   = errors.New("account name is invalid")
	ErrInvalidKind   = errors.New("kind is invalid")
)

// Service owns the accounts table. Create it with New.
type Service struct {
	db *gorm.DB
}

func New(db *gorm.DB) *Service {
	return &Service{
		db: db,
	}
}

// WithTx returns a copy of the service that runs on tx.
func (a *Service) WithTx(tx *gorm.DB) *Service {
	c := *a
	c.db = tx
	return &c
}

func isValidName(name string) bool {
	if len(name) < 8 {
		return false
	}
	return true
}

func (a *Service) createAccount(ctx context.Context, account *db.Account) (*db.Account, error) {
	if account == nil {
		return nil, ErrNilAccount
	}
	if !isValidName(account.Name) {
		return nil, ErrInvalidName
	}

	err := gorm.G[db.Account](a.db).Create(ctx, account)

	if err != nil {
		return nil, fmt.Errorf("create account: %w", err)
	}

	return account, nil
}

func (a *Service) CreateUser(ctx context.Context, name string) (*db.Account, error) {
	userAccount, err := a.createAccount(ctx, &db.Account{
		Kind: db.AccountKindUser,
		Name: name,
	})

	if err != nil {
		return nil, err
	}
	return userAccount, nil
}

func (a *Service) CreateSubAccount(ctx context.Context, parentID, name string, kind db.AccountKind) (*db.Account, error) {
	if kind != db.AccountKindService && kind != db.AccountKindComputer {
		return nil, ErrInvalidKind
	}

	parent, err := a.GetAccount(ctx, parentID)
	if errors.Is(err, ErrNotFound) {
		return nil, ErrInvalidParent
	}
	if err != nil {
		return nil, err
	}
	if parent.Kind != db.AccountKindUser {
		return nil, fmt.Errorf("parent is not user: %w", ErrInvalidParent)
	}
	if parent.DisabledAt != nil {
		return nil, fmt.Errorf("parent is disabled: %w", ErrInvalidParent)
	}

	subAccount, err := a.createAccount(ctx, &db.Account{
		Kind:     kind,
		ParentID: &parentID,
		Name:     name,
	})

	if err != nil {
		return nil, err
	}

	return subAccount, nil
}

func (a *Service) GetAccount(ctx context.Context, accountID string) (*db.Account, error) {
	user, err := gorm.G[db.Account](a.db).Where("id = ?", accountID).First(ctx)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get account %s: %w", accountID, err)
	}
	return &user, nil
}

func (a *Service) ListSubAccounts(ctx context.Context, accountID string) ([]db.Account, error) {
	subAccounts, err := gorm.G[db.Account](a.db).Where("parent_id = ?", accountID).Find(ctx)

	if err != nil {
		return nil, fmt.Errorf("list sub-accounts of %s: %w", accountID, err)
	}

	return subAccounts, nil
}

func (a *Service) DisableAccount(ctx context.Context, accountID string) error {
	count, err := gorm.G[db.Account](a.db).Where("id = ? AND disabled_at IS NULL", accountID).Update(ctx, "DisabledAt", time.Now().UTC())

	if err != nil {
		return fmt.Errorf("disable account %s: %w", accountID, err)
	}

	if count == 0 {
		n, err := gorm.G[db.Account](a.db).Where("id = ?", accountID).Count(ctx, "*")
		if err != nil {
			return fmt.Errorf("check account %s exists: %w", accountID, err)
		}
		if n == 0 {
			return ErrNotFound
		}
	}

	return nil
}
