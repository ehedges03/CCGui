package auth

import (
	"encoding/base64"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
)

func TestHashPasswordRoundTrip(t *testing.T) {
	encoded, err := hashPassword("foo-password")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}

	params, values, err := parseEncodedHash(encoded)
	if err != nil {
		t.Fatalf("parseEncodedHash(%q): %v", encoded, err)
	}
	if *params != currentParams {
		t.Errorf("parsed params %+v, want currentParams %+v", *params, currentParams)
	}
	if !verifyPassword("foo-password", params, values) {
		t.Error("the correct password did not verify")
	}
	if verifyPassword("bar-password", params, values) {
		t.Error("a wrong password verified")
	}

	again, err := hashPassword("foo-password")
	if err != nil {
		t.Fatal(err)
	}
	if again == encoded {
		t.Error("hashing the same password twice gave the same result; the salt is not random")
	}
}

// TestCurrentParamsWithinLimits fails if currentParams is raised past the limits,
// which would make every newly hashed password unreadable.
func TestCurrentParamsWithinLimits(t *testing.T) {
	type field struct {
		name             string
		value, low, high uint32
	}
	fields := []field{
		{"memory", currentParams.memory, lowerLimitParams.memory, upperLimitParams.memory},
		{"time", currentParams.time, lowerLimitParams.time, upperLimitParams.time},
		{"threads", uint32(currentParams.threads), uint32(lowerLimitParams.threads), uint32(upperLimitParams.threads)},
		{"saltLen", currentParams.saltLen, lowerLimitParams.saltLen, upperLimitParams.saltLen},
		{"keyLen", currentParams.keyLen, lowerLimitParams.keyLen, upperLimitParams.keyLen},
	}
	for _, f := range fields {
		if f.value < f.low || f.value > f.high {
			t.Errorf("currentParams.%s = %d, outside limits [%d, %d]", f.name, f.value, f.low, f.high)
		}
	}

	// argon2 needs 8 KiB per thread; the memory floor must cover the most threads allowed.
	if min := 8 * uint32(upperLimitParams.threads); lowerLimitParams.memory < min {
		t.Errorf("lowerLimitParams.memory = %d, want at least %d (8 KiB × %d threads)", lowerLimitParams.memory, min, upperLimitParams.threads)
	}
}

func TestParseEncodedHashRejectsMalformed(t *testing.T) {
	valid, err := hashPassword("foo-password")
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(valid, "$")
	// with replaces one $-separated section of the valid hash.
	with := func(i int, v string) string {
		p := slices.Clone(parts)
		p[i] = v
		return strings.Join(p, "$")
	}
	b64 := func(n int) string { return base64.RawStdEncoding.EncodeToString(make([]byte, n)) }

	cases := map[string]string{
		"empty":                 "",
		"too few sections":      "$argon2id$v=19",
		"wrong algorithm":       with(1, "argon2i"),
		"unsupported version":   with(2, "v=18"),
		"unreadable version":    with(2, "version"),
		"unreadable params":     with(3, "m=x,t=1,p=4"),
		"salt not base64":       with(4, "!!!"),
		"hash not base64":       with(5, "!!!"),
		"time zero":             with(3, "m=65536,t=0,p=4"),
		"threads zero":          with(3, "m=65536,t=1,p=0"),
		"memory below floor":    with(3, "m=64,t=1,p=4"),
		"memory above ceiling":  with(3, fmt.Sprintf("m=%d,t=1,p=4", upperLimitParams.memory+1)),
		"time above ceiling":    with(3, fmt.Sprintf("m=65536,t=%d,p=4", upperLimitParams.time+1)),
		"threads above ceiling": with(3, fmt.Sprintf("m=65536,t=1,p=%d", upperLimitParams.threads+1)),
		"salt too short":        with(4, b64(int(lowerLimitParams.saltLen)-1)),
		"salt too long":         with(4, b64(int(upperLimitParams.saltLen)+1)),
		"hash too short":        with(5, b64(int(lowerLimitParams.keyLen)-1)),
		"hash too long":         with(5, b64(int(upperLimitParams.keyLen)+1)),
	}
	for name, encoded := range cases {
		t.Run(name, func(t *testing.T) {
			_, _, err := parseEncodedHash(encoded)
			if !errors.Is(err, ErrMalformedHash) {
				t.Fatalf("parseEncodedHash(%q): got %v, want ErrMalformedHash", encoded, err)
			}
		})
	}
}

func TestNeedRehash(t *testing.T) {
	encoded, err := hashPassword("foo-password")
	if err != nil {
		t.Fatal(err)
	}
	params, _, err := parseEncodedHash(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if needRehash(params) {
		t.Error("a freshly made hash reports needing a rehash")
	}

	changed := map[string]func(p *hashParams){
		"memory":  func(p *hashParams) { p.memory++ },
		"time":    func(p *hashParams) { p.time++ },
		"threads": func(p *hashParams) { p.threads++ },
		"saltLen": func(p *hashParams) { p.saltLen++ },
		"keyLen":  func(p *hashParams) { p.keyLen++ },
	}
	for name, change := range changed {
		t.Run(name, func(t *testing.T) {
			p := params
			change(p)
			if !needRehash(p) {
				t.Errorf("params with a different %s do not report needing a rehash", name)
			}
		})
	}
}
