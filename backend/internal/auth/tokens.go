package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
)

var (
	tokenSize = 32
)

func generateToken(prefix string) (string, error) {
	b := make([]byte, tokenSize)
	// rand.Read fills the slice with cryptographically secure random bytes
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}

	return prefix + "_" + base64.RawURLEncoding.EncodeToString(b), nil
}

func hashToken(token string) string {
	hasher := sha256.New()

	hasher.Write([]byte(token))

	hashBytes := hasher.Sum(nil)

	return base64.RawURLEncoding.EncodeToString(hashBytes)
}
