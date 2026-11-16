package auth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"ehedges.net/ccgui/backend/internal/accounts"
	"ehedges.net/ccgui/backend/internal/db"
	"gorm.io/gorm"
)

var (
	ErrUsernameTaken          = errors.New("username already taken")
	ErrUserAlreadyHasPassword = errors.New("account already has a password")
	ErrInvalidUsername        = errors.New("invalid username")
	ErrInvalidPassword        = errors.New("invalid password")
	ErrAccountDisabled        = errors.New("account disabled")
)

// Service owns credentials. Create it with New.
type Service struct {
	db       *gorm.DB
	accounts *accounts.Service
	now      func() time.Time
}

func New(db *gorm.DB, accountsService *accounts.Service, now func() time.Time) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{
		db:       db,
		accounts: accountsService,
		now:      now,
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

type IssuedTokens struct {
	RefreshToken      string
	AccessToken       string
	AccessTokenExpiry time.Time
}

// redactToken keeps only the prefix (e.g. "ccr_") so logs show which kind of
// token it was without leaking it.
func redactToken(token string) string {
	if i := strings.IndexByte(token, '_'); i >= 0 {
		return token[:i+1] + "[redacted]"
	}
	return "[redacted]"
}

// String keeps the plaintext tokens out of fmt output (%v, %s, %+v).
func (t IssuedTokens) String() string {
	return fmt.Sprintf("IssuedTokens{RefreshToken: %s, AccessToken: %s, AccessTokenExpiry: %s}",
		redactToken(t.RefreshToken), redactToken(t.AccessToken), t.AccessTokenExpiry.Format(time.RFC3339))
}

// LogValue keeps the plaintext tokens out of slog output, for both the text and
// JSON handlers.
func (t IssuedTokens) LogValue() slog.Value {
	return slog.GroupValue(
		slog.String("refresh_token", redactToken(t.RefreshToken)),
		slog.String("access_token", redactToken(t.AccessToken)),
		slog.Time("access_token_expiry", t.AccessTokenExpiry),
	)
}

const accessTokenTTL = 10 * time.Minute

func (a *Service) StartSession(ctx context.Context, accountID string, ip *string) (*IssuedTokens, error) {
	var err error
	now := a.now().UTC()
	response := IssuedTokens{
		AccessTokenExpiry: now.Add(accessTokenTTL),
	}
	response.RefreshToken, err = generateToken("ccr")
	if err != nil {
		return nil, err
	}
	response.AccessToken, err = generateToken("cca")
	if err != nil {
		return nil, err
	}
	err = a.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		account, err := a.accounts.WithTx(tx).GetAccount(ctx, accountID)
		if err != nil {
			return err
		}

		if account.DisabledAt != nil {
			return ErrAccountDisabled
		}

		rf := &db.RefreshFamily{
			AccountID: accountID,
			BoundIP:   ip,
			CreatedAt: now,
		}

		err = gorm.G[db.RefreshFamily](tx).Create(ctx, rf)

		if err != nil {
			return fmt.Errorf("create refresh family: %w", err)
		}

		rt := &db.RefreshToken{
			FamilyID:   rf.ID,
			Generation: 0,
			Hash:       hashToken(response.RefreshToken),
			State:      db.RefreshTokenIssued,
			IssuedAt:   now,
		}

		err = gorm.G[db.RefreshToken](tx).Create(ctx, rt)

		if err != nil {
			return fmt.Errorf("create refresh token: %w", err)
		}

		at := &db.AccessToken{
			AccountID:         accountID,
			IssuedByRefreshID: rt.ID,
			Hash:              hashToken(response.AccessToken),
			ExpiresAt:         response.AccessTokenExpiry,
			CreatedAt:         now,
		}

		err = gorm.G[db.AccessToken](tx).Create(ctx, at)

		if err != nil {
			return fmt.Errorf("create access token: %w", err)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &response, nil
}
