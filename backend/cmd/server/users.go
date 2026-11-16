package main

import (
	"context"
	"fmt"

	"ehedges.net/ccgui/backend/internal/auth"
	"ehedges.net/ccgui/backend/internal/db"
)

// createUserFromInput prompts for whatever was not given as a flag, then creates the user.
func createUserFromInput(ctx context.Context, svc *auth.Service, p prompter, name, username string) (*db.Account, error) {
	var err error
	if name == "" {
		if name, err = p.line("Name: "); err != nil {
			return nil, fmt.Errorf("read name: %w", err)
		}
	}
	if username == "" {
		if username, err = p.line("Username: "); err != nil {
			return nil, fmt.Errorf("read username: %w", err)
		}
	}
	password, err := p.secret("Password: ")
	if err != nil {
		return nil, fmt.Errorf("read password: %w", err)
	}

	account, err := svc.CreateUserWithPassword(ctx, name, username, password)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return account, nil
}
