package auth

import (
	"encoding/base64"
	"regexp"
	"testing"
)

func TestGenerateToken(t *testing.T) {
	urlSafe := regexp.MustCompile(`^ccr_[A-Za-z0-9_-]+$`)
	seen := map[string]bool{}

	for range 1000 {
		token, err := generateToken("ccr")
		if err != nil {
			t.Fatalf("generateToken: %v", err)
		}
		if !urlSafe.MatchString(token) {
			t.Fatalf("token %q is not ccr_ followed by URL-safe characters", token)
		}
		if want := len("ccr_") + base64.RawURLEncoding.EncodedLen(tokenSize); len(token) != want {
			t.Fatalf("token %q has length %d, want %d", token, len(token), want)
		}
		if seen[token] {
			t.Fatalf("token %q generated twice", token)
		}
		seen[token] = true
	}
}

func TestHashToken(t *testing.T) {
	token, err := generateToken("cca")
	if err != nil {
		t.Fatal(err)
	}
	other, err := generateToken("cca")
	if err != nil {
		t.Fatal(err)
	}

	if hashToken(token) != hashToken(token) {
		t.Error("hashing the same token twice gave different results")
	}
	if hashToken(token) == token {
		t.Error("the hash equals the plaintext token")
	}
	if hashToken(token) == hashToken(other) {
		t.Error("two different tokens hashed to the same value")
	}
}
