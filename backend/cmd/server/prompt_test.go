package main

import (
	"bufio"
	"bytes"
	"errors"
	"io"
	"strings"
	"testing"
)

// testPrompter mirrors newPrompter's piped-input setup, but keeps the prompts so
// tests can check them.
func testPrompter(text string) (prompter, *bytes.Buffer) {
	out := &bytes.Buffer{}
	p := prompter{lines: bufio.NewReader(strings.NewReader(text)), out: out}
	p.readSecret = func() (string, error) { return readLine(p.lines) }
	return p, out
}

func TestReadLine(t *testing.T) {
	r := bufio.NewReader(strings.NewReader("first\nlast"))

	if got, err := readLine(r); err != nil || got != "first\n" {
		t.Fatalf("first line: got %q, %v", got, err)
	}
	if got, err := readLine(r); err != nil || got != "last" {
		t.Fatalf("last line without a final newline: got %q, %v; want %q, nil", got, err, "last")
	}
	if _, err := readLine(r); !errors.Is(err, io.EOF) {
		t.Fatalf("after the input ends: got %v, want io.EOF", err)
	}
}

func TestLinePromptsAndTrims(t *testing.T) {
	p, out := testPrompter("  foo user \r\n")

	got, err := p.line("Name: ")
	if err != nil {
		t.Fatal(err)
	}
	if got != "foo user" {
		t.Errorf("line() = %q, want %q", got, "foo user")
	}
	if out.String() != "Name: " {
		t.Errorf("prompt output = %q, want %q", out.String(), "Name: ")
	}
}

func TestSecretStripsOnlyLineEnding(t *testing.T) {
	p, _ := testPrompter(" secret pass \r\n")

	got, err := p.secret("Password: ")
	if err != nil {
		t.Fatal(err)
	}
	if want := " secret pass "; got != want {
		t.Fatalf("secret() = %q, want %q (line ending removed, spaces kept)", got, want)
	}
}

func TestSecretUsesReadSecret(t *testing.T) {
	p, _ := testPrompter("not-the-secret\n")
	p.readSecret = func() (string, error) { return "from-terminal", nil }

	got, err := p.secret("Password: ")
	if err != nil || got != "from-terminal" {
		t.Fatalf("secret() = %q, %v; want it read through readSecret", got, err)
	}
}
