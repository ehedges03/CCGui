package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"golang.org/x/term"
)

// prompter reads answers for interactive commands. newPrompter wires it to the
// real terminal; tests build one from strings.
type prompter struct {
	lines      *bufio.Reader          // line answers (and secrets when not a terminal)
	out        io.Writer              // prompts
	readSecret func() (string, error) // secrets: hidden terminal input, or a line from lines
}

// newPrompter reads from stdin. On a terminal it prints prompts and hides secrets
// as they are typed; with piped input it prints no prompts and reads secrets as
// ordinary lines.
func newPrompter(stdin *os.File, stdout io.Writer) prompter {
	p := prompter{lines: bufio.NewReader(stdin), out: stdout}
	fd := int(stdin.Fd())
	if term.IsTerminal(fd) {
		p.readSecret = func() (string, error) {
			b, err := term.ReadPassword(fd)
			fmt.Fprintln(stdout) // the typed Enter is not echoed
			return string(b), err
		}
		return p
	}

	p.out = io.Discard
	p.readSecret = func() (string, error) { return readLine(p.lines) }
	return p
}

// readLine reads one line. Input that ends without a final newline still counts.
func readLine(r *bufio.Reader) (string, error) {
	s, err := r.ReadString('\n')
	if errors.Is(err, io.EOF) && s != "" {
		return s, nil
	}
	return s, err
}

// line prompts for one line of input and trims surrounding whitespace.
func (p prompter) line(prompt string) (string, error) {
	fmt.Fprint(p.out, prompt)
	s, err := readLine(p.lines)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(s), nil
}

// secret prompts for hidden input. Only the line ending is removed: spaces can be
// part of a password.
func (p prompter) secret(prompt string) (string, error) {
	fmt.Fprint(p.out, prompt)
	s, err := p.readSecret()
	if err != nil {
		return "", err
	}
	return strings.TrimRight(s, "\r\n"), nil
}
