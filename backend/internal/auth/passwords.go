package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

var (
	// ErrMalformedHash means a stored hash could not be read. That is a server-side
	// data problem, not a wrong password.
	ErrMalformedHash = errors.New("malformed hash")
)

type hashParams struct {
	memory  uint32
	time    uint32
	threads uint8
	saltLen uint32
	keyLen  uint32
}

type hashValues struct {
	salt         []byte
	expectedHash []byte
}

var currentParams = hashParams{memory: 64 * 1024, time: 1, threads: 4, saltLen: 16, keyLen: 32}

// Limits for hashes read back from storage. currentParams must stay inside them,
// or newly hashed passwords would fail to parse (TestCurrentParamsWithinLimits).
// memory 128 = argon2's 8 KiB per thread × the 16-thread maximum.
var lowerLimitParams = hashParams{memory: 128, time: 1, threads: 1, saltLen: 16, keyLen: 16}
var upperLimitParams = hashParams{memory: 4 * 64 * 1024, time: 10, threads: 16, saltLen: 64, keyLen: 64}

func parseEncodedHash(encodedHash string) (*hashParams, *hashValues, error) {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return nil, nil, fmt.Errorf("%w: invalid hash format", ErrMalformedHash)
	}

	var version int
	_, err := fmt.Sscanf(parts[2], "v=%d", &version)
	if err != nil {
		return nil, nil, fmt.Errorf("%w: parse hash version: %w", ErrMalformedHash, err)
	}

	if version != argon2.Version {
		return nil, nil, fmt.Errorf("%w: unsupported argon2 version %d (server uses %d)", ErrMalformedHash, version, argon2.Version)
	}

	params := hashParams{}
	values := hashValues{}
	_, err = fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &params.memory, &params.time, &params.threads)
	if err != nil {
		return nil, nil, fmt.Errorf("%w: parse hash params: %w", ErrMalformedHash, err)
	}

	values.salt, err = base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return nil, nil, fmt.Errorf("%w: decode salt: %w", ErrMalformedHash, err)
	}
	params.saltLen = uint32(len(values.salt))

	values.expectedHash, err = base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return nil, nil, fmt.Errorf("%w: decode hash: %w", ErrMalformedHash, err)
	}
	params.keyLen = uint32(len(values.expectedHash))

	if params.memory < lowerLimitParams.memory ||
		params.time < lowerLimitParams.time ||
		params.threads < lowerLimitParams.threads ||
		params.saltLen < lowerLimitParams.saltLen ||
		params.keyLen < lowerLimitParams.keyLen {
		return nil, nil, fmt.Errorf("%w: argon2 params %+v fall below lower limit %+v", ErrMalformedHash, params, lowerLimitParams)
	}

	if params.memory > upperLimitParams.memory ||
		params.time > upperLimitParams.time ||
		params.threads > upperLimitParams.threads ||
		params.saltLen > upperLimitParams.saltLen ||
		params.keyLen > upperLimitParams.keyLen {
		return nil, nil, fmt.Errorf("%w: argon2 params %+v fall above upper limit %+v", ErrMalformedHash, params, upperLimitParams)
	}
	return &params, &values, nil
}

func hashPassword(password string) (string, error) {
	salt := make([]byte, currentParams.saltLen)
	// rand.Read fills the slice with cryptographically secure random bytes
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}

	hash := argon2.IDKey([]byte(password), salt, currentParams.time, currentParams.memory, currentParams.threads, currentParams.keyLen)

	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, currentParams.memory, currentParams.time, currentParams.threads, b64Salt, b64Hash), nil
}

func verifyPassword(password string, params hashParams, values hashValues) bool {
	computedHash := argon2.IDKey([]byte(password), values.salt, params.time, params.memory, params.threads, params.keyLen)

	return subtle.ConstantTimeCompare(values.expectedHash, computedHash) == 1
}

func needRehash(params hashParams) bool {
	return params != currentParams
}
